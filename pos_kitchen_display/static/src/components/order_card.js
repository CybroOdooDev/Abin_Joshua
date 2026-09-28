/** @odoo-module **/

import { Component, useState, onMounted, onWillUnmount } from "@odoo/owl";
import { useKitchenDisplay } from "@pos_kitchen_display/app/kitchen_service";
import { OrderLine } from "@pos_kitchen_display/components/order_line";
import { _t } from "@web/core/l10n/translation";

const tickListeners = new Set();
let _globalTimer = null;

function startGlobalTick() {
    if (_globalTimer) return;
    _globalTimer = setInterval(() => { tickListeners.forEach(fn => fn()); }, 1000);
}

function stopGlobalTick() {
    if (tickListeners.size === 0 && _globalTimer) {
        clearInterval(_globalTimer);
        _globalTimer = null;
    }
}

export class OrderCard extends Component {
    setup() {
        this.kitchen = useKitchenDisplay();
        this._t = _t;
        this.state = useState({ tick: 0, notified: false });
        const onTick = () => { this.state.tick++; };
        onMounted(() => { tickListeners.add(onTick); startGlobalTick(); });
        onWillUnmount(() => { tickListeners.delete(onTick); stopGlobalTick(); });
    }

    _getSortedStages() {
        return Array.from(this.kitchen.stages.values())
            .sort((a, b) => a.sequence - b.sequence);
    }

    async notifyWaiter(ev) {
        ev.stopPropagation();
        if (this.state.notified) return;
        await fetch("/kitchen/notify_waiter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0", method: "call",
                params: { order_id: this.props.order.id }, id: 1,
            }),
        });
        this.state.notified = true;
        setTimeout(() => { this.state.notified = false; }, 10000);
    }

    get groupedCourses() {
        const courseMap = {};

        this.props.order.lines.forEach(line => {
            const courseName = line.plating_level_name || "General";
            const courseSeq = line.plating_level_sequence !== undefined ? line.plating_level_sequence : 999;
            const courseColor = line.plating_level_color || "#3B82F6";
            const courseId = line.plating_level_id || null;
            const courseKey = `${String(courseSeq).padStart(4, "0")}_${courseName}`;

            if (!courseMap[courseKey]) {
                courseMap[courseKey] = {
                    key: courseKey,
                    id: courseId,
                    name: courseName,
                    sequence: courseSeq,
                    color: courseColor,
                    combos: {},
                    normals: [],
                    allLines: [],
                };
            }

            const course = courseMap[courseKey];
            course.allLines.push(line);

            if (line.combo_name && line.combo_name.trim() !== "") {
                const instanceKey = line.combo_instance_uuid;
                if (!course.combos[instanceKey]) {
                    course.combos[instanceKey] = {
                        name: line.combo_name,
                        instanceKey,
                        familyMap: {},
                        allLines: [],
                    };
                }
                const inst = course.combos[instanceKey];
                inst.allLines.push(line);

                if (line.pos_line_uuid === line.combo_instance_uuid) {
                    return;
                }
                const family =
                    (line.categories && line.categories[0]) ||
                    (line.subcategories && line.subcategories[0]) ||
                    "Others";
                if (!inst.familyMap[family]) inst.familyMap[family] = [];
                inst.familyMap[family].push(line);
            } else {
                course.normals.push(line);
            }
        });

        return Object.values(courseMap)
            .sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name))
            .map(course => {
                const comboList = Object.values(course.combos).map(inst => {
                    const parentLine = inst.allLines.find(
                        l => l.pos_line_uuid === inst.instanceKey
                    );
                    const parentQty = parentLine ? (parentLine.qty || 1) : 1;
                    const families = Object.entries(inst.familyMap)
                        .sort(([a], [b]) => a.localeCompare(b));
                    return {
                        name: inst.name,
                        instanceKey: inst.instanceKey,
                        families,
                        allLines: inst.allLines,
                        parentQty,
                    };
                });

                const reminderCount = Math.max(0, ...course.allLines.map(l => l.reminder_count || 0));

                return {
                    ...course,
                    comboList,
                    reminderCount,
                };
            });
    }

    get isFirstStageForLines() {
        const stages = this._getSortedStages();
        const firstId = stages.length ? stages[0].id : null;
        return (lines) => {
            if (!stages.length) return true;
            return lines.every(l => l.stage_id === firstId);
        };
    }

    get isLastStageForLines() {
        const stages = this._getSortedStages();
        const lastId = stages.length ? stages[stages.length - 1].id : null;
        return (lines) => {
            if (!stages.length) return false;
            return lines.every(l => l.stage_id === lastId);
        };
    }

    async acceptOrder(ev) {
        ev.stopPropagation();
        const isLast = this.isLastStageForLines(this.props.order.lines);
        if (isLast) {
            if (!confirm(_t("Finish entire order?"))) return;
            await this.env.services.orm.call(
                "kitchen.order.line", "action_finish",
                [this.props.order.lines.map(l => l.id)]
            );
        } else {
            if (!confirm(_t("Accept entire order?"))) return;
            await this.env.services.orm.call(
                "kitchen.order.line", "action_accept_order",
                [[], this.props.order.id]
            );
        }
    }

    async moveCoursePrev(ev, courseLines) {
        ev.stopPropagation();
        await this.env.services.orm.call(
            "kitchen.order.line", "action_previous_stage",
            [courseLines.map(l => l.id)]
        );
        await this.kitchen.reload();
    }

    async moveCourseNext(ev, courseLines) {
        ev.stopPropagation();
        await this.env.services.orm.call(
            "kitchen.order.line", "action_next_stage",
            [courseLines.map(l => l.id)]
        );
    }

    async finishCourse(ev, courseLines) {
        ev.stopPropagation();
        await this.env.services.orm.call(
            "kitchen.order.line", "action_finish",
            [courseLines.map(l => l.id)]
        );
        await this.kitchen.reload();
    }

    async moveComboPrev(ev, allLines) {
        ev.stopPropagation();
        await this.env.services.orm.call(
            "kitchen.order.line", "action_previous_stage",
            [allLines.map(l => l.id)]
        );
        await this.kitchen.reload();
    }

    async finishCombo(ev, allLines) {
        ev.stopPropagation();
        await this.env.services.orm.call(
            "kitchen.order.line", "action_finish",
            [allLines.map(l => l.id)]
        );
        await this.kitchen.reload();
    }

    async moveComboNext(ev, allLines) {
        ev.stopPropagation();
        await this.env.services.orm.call(
            "kitchen.order.line", "action_next_stage",
            [allLines.map(l => l.id)]
        );
    }

    get waitingMinutes() {
        let minStart = null;
        this.props.order.lines.forEach(line => {
            if (line.start_time) {
                const start = new Date(line.start_time.replace(" ", "T") + "Z");
                if (!minStart || start < minStart) minStart = start;
            }
        });
        if (!minStart) return 0;
        return Math.floor((new Date() - minStart) / 60000);
    }

    get cardClass() {
        let maxDelay = 0, alert = 0;
        this.props.order.lines.forEach(line => {
            const stage = this.kitchen.stages.get(line.stage_id);
            if (!stage) return;
            const wait = (new Date() - new Date(line.start_time.replace(" ", "T") + "Z")) / 60000;
            if (wait > maxDelay) { maxDelay = wait; alert = stage.alert_timer; }
        });
        if (alert && maxDelay > alert)       return "kds-card late";
        if (alert && maxDelay > alert * 0.7) return "kds-card warning";
        return "kds-card";
    }

    get stage() {
        let maxStage = null;
        this.props.order.lines.forEach(line => {
            const stage = this.kitchen.stages.get(line.stage_id);
            if (!stage) return;
            if (!maxStage || stage.sequence > maxStage.sequence) maxStage = stage;
        });
        return maxStage;
    }

    get stageName()  { return this.stage ? this.stage.name : ""; }
    get stageStyle() { return this.stage ? `background-color: ${this.stage.color}` : ""; }
}

OrderCard.components = { OrderLine };
OrderCard.template = "pos_kitchen_display.OrderCard";