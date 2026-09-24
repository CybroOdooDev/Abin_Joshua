/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { mountComponent } from "@web/env";
import { useKitchenDisplay } from "@pos_kitchen_display/app/kitchen_service";
import { _t } from "@web/core/l10n/translation";
import { Stage } from "@pos_kitchen_display/components/stage";

export class KitchenApp extends Component {
    setup() {
        this.kitchen = useKitchenDisplay();
        this._t = _t;
        this.state = useState({
            activeStage: null,
        });
        document.addEventListener("click", () => {
            const audio = new Audio("/pos_kitchen_display/static/src/sounds/kitchenorder_notification.wav");
            audio.play().then(() => {
                audio.pause();
                audio.currentTime = 0;
            }).catch(() => {});
        }, { once: true });
    }

    get stageList() {
        const stages = Array.from(this.kitchen.stages.values())
            .sort((a, b) => a.sequence - b.sequence);
        const allStage = { id: 0, name: _t("ALL"), sequence: -1 };
        const result = [allStage, ...stages];
        if (this.state.activeStage === null && stages.length) {
            this.state.activeStage = stages[0].id;
        }
        return result;
    }

    selectStage(stage) {
        this.state.activeStage = stage.id;
    }

    get activeStage() {
        if (this.state.activeStage === 0 || this.state.activeStage === null) {
            return { id: 0, name: _t("ALL") };
        }
        return this.kitchen.stages.get(this.state.activeStage);
    }
    getStageCount(stageId) {
        let count = 0;
        this.kitchen.orders.forEach(order => {
            order.lines.forEach(line => {
                if (stageId === 0 || line.stage_id === stageId) count++;
            });
        });
        return count;
    }
    closeDisplay() {
        window.history.back();
    }
    get isLastStage() {
        const active = this.activeStage;
        const stages = Array.from(this.kitchen.stages.values())
            .sort((a, b) => a.sequence - b.sequence);
        const lastStage = stages[stages.length - 1];
        return active && lastStage && active.id === lastStage.id;
    }
    async finishAll() {
        await this.env.services.orm.call(
            "kitchen.order.line",
            "action_finish_all",
            [odoo.kitchen_display.id]
        );
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

    // NEW: called by the ✕ button on each reminder popup
    dismissReminder(id) {
        const idx = this.kitchen.reminderPopups.findIndex(p => p.id === id);
        if (idx !== -1) {
            this.kitchen.reminderPopups.splice(idx, 1);
        }
    }
}

KitchenApp.template = "pos_kitchen_display.KitchenApp";
KitchenApp.components = { Stage };

window.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("root");
    if (root) {
        mountComponent(KitchenApp, root);
    }
});