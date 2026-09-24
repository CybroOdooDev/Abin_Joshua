/** @odoo-module **/

import { Component, useState, onMounted, onWillUnmount } from "@odoo/owl";
import { useKitchenDisplay } from "@pos_kitchen_display/app/kitchen_service";
import { _t } from "@web/core/l10n/translation";

export class OrderLine extends Component {
    setup() {
        this.kitchen = useKitchenDisplay();
        this._t = _t;
        this.state = useState({
            tick: 0
        });
        onMounted(() => {
            this.interval = setInterval(() => {
                this.state.tick++;
            }, 1000);
        });
        onWillUnmount(() => {
            clearInterval(this.interval);
        });
    }
    get waitingMinutes() {
        if (!this.props.line.start_time) {
            return 0;
        }
        // Convert Odoo datetime to ISO
        const start = new Date(this.props.line.start_time.replace(" ", "T") + "Z");
        const now = new Date();

        const diff = now - start;

        return Math.max(0, Math.floor(diff / 60000));
    }
    get stages() {
        return Array.from(this.kitchen.stages.values())
            .sort((a, b) => a.sequence - b.sequence);
    }
    get isFirstStage() {
        const firstStage = this.stages[0];
        return firstStage && this.props.line.stage_id === firstStage.id;
    }
    get cardClass() {
        const stage = this.kitchen.stages.get(this.props.line.stage_id);
        if (!stage) {
            return "kds-card";
        }
        const alert = stage.alert_timer;
        const wait = this.waitingMinutes;
        if (alert && wait > alert) {
            return "kds-card late";
        }
        if (alert && wait > alert * 0.7) {
            return "kds-card warning";
        }
        return "kds-card";
    }
    get stage() {
        return this.kitchen.stages.get(this.props.line.stage_id);
    }
    get isLastStage() {
        const stages = this.stages;
        const lastStage = stages[stages.length - 1];
        return lastStage && this.props.line.stage_id === lastStage.id;
    }
    async finishOrder(ev) {
        ev.stopPropagation();
        await this.env.services.orm.call(
            "kitchen.order.line",
            "action_finish",
            [[this.props.line.id]]
        );

        await this.reload();
    }
    async nextStage() {
        await this.env.services.orm.call(
            "kitchen.order.line",
            "action_next_stage",
            [[this.props.line.id]]
        );
        this.reload();
    }
    async previousStage(ev) {
        ev.stopPropagation();
        await this.env.services.orm.call(
            "kitchen.order.line",
            "action_previous_stage",
            [[this.props.line.id]]
        );
        this.reload();
    }
    async reload() {
        const response = await fetch("/kitchen/data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "call",
                params: { display_id: odoo.kitchen_display.id },
                id: 1,
            }),
        });
        const json = await response.json();
        this.kitchen.orders = json.result.orders;
    }
}
OrderLine.template = "pos_kitchen_display.OrderLine";