/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { ActionpadWidget } from "@point_of_sale/app/screens/product_screen/action_pad/action_pad";

patch(ActionpadWidget.prototype, {
    async submitOrder() {
        const order = this.currentOrder;
        order.send_to_kitchen = true;
        await this.pos.sendOrderInPreparationUpdateLastChange(order);
    },
});