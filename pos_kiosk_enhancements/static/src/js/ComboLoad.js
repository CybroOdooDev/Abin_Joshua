/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { Combo } from "@pos_self_order/app/models/combo";

patch(Combo.prototype, {

    setup(combo) {
        // ✅ Call original method manually
        super.setup(...arguments);
        this.allow_quantity = combo.allow_quantity || false;
        this.free_limit = combo.free_limit || false;
    },

});