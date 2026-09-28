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
        return defaultRec ? defaultRec.id : this.platingLevels[0].id;
    }

    get activePlatingLevelId() {
        const order = this.currentOrder;
        if (!order) return this.defaultLevelId;
        if (!order.selected_plating_level_id) {
            order.selected_plating_level_id = this.defaultLevelId;
        }
        return order.selected_plating_level_id;
    }

    setPlatingLevel(levelId) {
        const order = this.currentOrder;
        if (!order) return;
        order.selected_plating_level_id = levelId;
        this.state.activeLevelId = levelId;
    }
}
