/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";

export class PlatingLevelSelector extends Component {
    static template = "pos_kitchen_display.PlatingLevelSelector";

    setup() {
        this.pos = usePos();
        this.state = useState({
            activeLevelId: this.activePlatingLevelId,
        });
    }

    get currentOrder() {
        return this.pos.get_order();
    }

    get platingLevels() {
        const levels = this.pos.pos_plating_level || [];
        return [...levels].sort((a, b) => (a.sequence || 10) - (b.sequence || 10));
    }

    get defaultLevelId() {
        if (!this.platingLevels.length) return null;
        const defaultRec = this.platingLevels.find(l => l.is_default);
        return defaultRec ? defaultRec.id : null;
    }

    get activePlatingLevelId() {
        if (!this.pos.config.enable_plating_level) return null;
        const order = this.currentOrder;
        if (!order) return null;
        return order.get_selected_plating_level_id ? order.get_selected_plating_level_id() : (order.selected_plating_level_id || null);
    }

    setPlatingLevel(levelId) {
        const order = this.currentOrder;
        if (!order) return;
        const current = order.get_selected_plating_level_id ? order.get_selected_plating_level_id() : order.selected_plating_level_id;
        const next = current === levelId ? null : levelId;
        if (order.set_selected_plating_level) {
            order.set_selected_plating_level(next);
        } else {
            order.selected_plating_level_id = next;
        }
        this.state.activeLevelId = next;
    }
}
