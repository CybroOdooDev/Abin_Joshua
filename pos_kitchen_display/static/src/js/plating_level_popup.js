/** @odoo-module **/

import { Component } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class PlatingLevelPopup extends Component {
    static template = "pos_kitchen_display.PlatingLevelPopup";

    setup() {
        this.pos = useService("pos");
    }

    get platingLevels() {
        const levels = this.pos.pos_plating_level || [];
        return [...levels].sort((a, b) => (a.sequence || 10) - (b.sequence || 10));
    }

    get currentPlatingLevelId() {
        return this.props.line ? (this.props.line.plating_level_id || (this.props.line.plating_level && this.props.line.plating_level.id)) : null;
    }

    selectLevel(level) {
        if (this.props.line) {
            const currentOrder = this.pos.get_order();
            if (currentOrder) {
                const lineUuid = this.props.line.uuid;
                const orderline = currentOrder.get_orderlines().find(l => l.uuid === lineUuid);
                if (orderline && orderline.set_plating_level) {
                    orderline.set_plating_level(level.id);
                }
            }
        }
        if (this.props.close) {
            this.props.close();
        }
    }

    cancel() {
        if (this.props.close) {
            this.props.close();
        }
    }
}
