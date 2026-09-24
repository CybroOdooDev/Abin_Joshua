/** @odoo-module **/

import { Component } from "@odoo/owl";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { CategoryReminderPopup } from "@pos_kitchen_display/js/kitchen_reminder_popup";

export class KitchenReminderButton extends Component {
    static template = "pos_kitchen_display.KitchenReminderButton";

    setup() {
        this.pos = usePos();
        this.popup = useService("popup");
    }

    get currentOrder() {
        return this.pos.get_order();
    }

    async click() {
        const order = this.currentOrder;
        if (!order) return;

        this.popup.add(CategoryReminderPopup, {
            order: order,
        });
    }
}
ProductScreen.addControlButton({
    component: KitchenReminderButton,
    condition: function () {
        return true;
    },
});