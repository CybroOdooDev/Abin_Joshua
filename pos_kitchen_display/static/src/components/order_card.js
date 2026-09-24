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
    get groupedLines() {
        const comboInstances = {};

        this.props.order.lines.forEach(line => {
            if (!line.combo_name || line.combo_name.trim() === "") return;
            const instanceKey = line.combo_instance_uuid;

            if (!comboInstances[instanceKey]) {
                comboInstances[instanceKey] = {
                    name: line.combo_name,
                    instanceKey,
                    familyMap: {},
                    allLines: [],
                };
            }

            const inst = comboInstances[instanceKey];

            // Skip the parent header row entirely — the combo block title
            // already displays the combo name; repeating it as "1 x Bocadillo"
            // under its own header is redundant and confusing.
            if (line.pos_line_uuid === line.combo_instance_uuid) {
                // Still add to allLines so stage nav buttons work correctly
                inst.allLines.push(line);
                return;
            }

            // Child line: group by the child product's own POS category
            const family =
                (line.categories    && line.categories[0])    ||
                (line.subcategories && line.subcategories[0]) ||
                "Others";

            if (!inst.familyMap[family]) inst.familyMap[family] = [];
            inst.familyMap[family].push(line);
            inst.allLines.push(line);
        });

        const combos = Object.values(comboInstances).map(inst => {
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

        // ── NORMAL LINES — grouped by POS category ───────────────────────
        const normalGroups = {};

        this.props.order.lines.forEach(line => {
            if (line.combo_name && line.combo_name.trim() !== "") return;

            const categoryLabel =
                (line.categories && line.categories[0]) || "Others";

            if (!normalGroups[categoryLabel]) {
                normalGroups[categoryLabel] = { lines: [] };
            }
            normalGroups[categoryLabel].lines.push(line);
        });

        return {
            combos,
            normals: Object.entries(normalGroups),
        };
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

    async moveCategoryNext(ev, categoryLabel) {
        ev.stopPropagation();
        const entry = this.groupedLines.normals.find(([k]) => k === categoryLabel);
        if (!entry) return;
        await this.env.services.orm.call(
            "kitchen.order.line", "action_next_stage",
            [entry[1].lines.map(l => l.id)]
        );
    }

    async moveCategoryPrev(ev, categoryLabel) {
        ev.stopPropagation();
        const entry = this.groupedLines.normals.find(([k]) => k === categoryLabel);
        if (!entry) return;
        await this.env.services.orm.call(
            "kitchen.order.line", "action_previous_stage",
            [entry[1].lines.map(l => l.id)]
        );
    }

    async finishCategory(ev, categoryLabel) {
        ev.stopPropagation();
        const entry = this.groupedLines.normals.find(([k]) => k === categoryLabel);
        if (!entry || !entry[1].lines.length) return;
        await this.env.services.orm.call(
            "kitchen.order.line", "action_finish",
            [entry[1].lines.map(l => l.id)]
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