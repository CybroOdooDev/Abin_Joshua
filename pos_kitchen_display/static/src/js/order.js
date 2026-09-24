/** @odoo-module **/

import { Order } from "@point_of_sale/app/store/models";
import { patch } from "@web/core/utils/patch";

patch(Order.prototype, {
    setup() {
        super.setup(...arguments);
        this.send_to_kitchen = false;
    },

    export_as_JSON() {
        const json = super.export_as_JSON(...arguments);
        json.send_to_kitchen = this.send_to_kitchen;
        return json;
    },

    init_from_JSON(json) {
        super.init_from_JSON(...arguments);
        this.send_to_kitchen = json.send_to_kitchen || false;
    },
});