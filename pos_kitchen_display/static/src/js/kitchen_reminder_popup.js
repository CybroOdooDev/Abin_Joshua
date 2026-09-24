/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class CategoryReminderPopup extends Component {
    setup() {
        this.orm = useService("orm");
        this.pos = useService("pos");
        const order = this.props.order;
        const categoryMap = new Map();
        order.get_orderlines().forEach(line => {
            const categIds = line.product.pos_categ_ids || [];
            if (!categIds.length) {
                categoryMap.set("others", {
                    id: "others",
                    name: "Others",
                });
                return;
            }
            categIds.forEach(categId => {
                const categ = this.pos.db.category_by_id[categId];
                if (categ && categ.id) {
                    categoryMap.set(categ.id, {
                        id: categ.id,
                        name: categ.name,
                    });
                }
            });
        });

        this.state = useState({
            categories: Array.from(categoryMap.values()),
            selected: [],
        });
    }

    toggleCategory(cat) {
        const exists = this.state.selected.find(c => c.id === cat.id);
        if (exists) {
            this.state.selected = this.state.selected.filter(c => c.id !== cat.id);
        } else {
            this.state.selected = [...this.state.selected, cat];
        }
    }

    async sendReminder() {
        const order = this.props.order;
        const categoryIds = this.state.selected.map(c => c.id);
        if (!categoryIds.length) return;
        const backendId = order.server_id || order.backendId;
        if (!backendId) {
            this.env.services.notification.add(
                "Order not saved to server yet. Please try again.",
                { title: "Not Ready", type: "warning" }
            );
            return;
        }
        await this.orm.call(
            "kitchen.order",
            "send_category_reminder",
            [[], backendId, categoryIds]
        );
        this.props.close();
    }
}
CategoryReminderPopup.template = "pos_kitchen_display.CategoryReminderPopup";
