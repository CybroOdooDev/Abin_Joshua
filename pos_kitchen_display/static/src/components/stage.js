/** @odoo-module **/

import { Component } from "@odoo/owl";
import { useKitchenDisplay } from "@pos_kitchen_display/app/kitchen_service";
import { OrderCard } from "@pos_kitchen_display/components/order_card";

export class Stage extends Component {
    setup() {
        this.kitchen = useKitchenDisplay();
    }

    get orders() {
        if (!this.props.stage) return [];

        return this.kitchen.orders.map(order => {
            const filteredLines = order.lines.filter(line => {
                return (
                    this.props.stage.id === 0 ||
                    line.stage_id === this.props.stage.id
                );
            });

            if (!filteredLines.length) return null;

            return {
                ...order,
                lines: filteredLines,
                waiter: order?.waiter || "",
            };
        }).filter(Boolean);
    }
}

Stage.components = { OrderCard };
Stage.template = "pos_kitchen_display.Stage";
