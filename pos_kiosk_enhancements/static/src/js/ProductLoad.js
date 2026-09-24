/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { Product } from "@pos_self_order/app/models/product";

patch(Product.prototype, {

    setup(product, showPriceTaxIncluded) {
        // call original method
        super.setup(...arguments);

        // ✅ inject your custom field
        this.free_combo_count = product.free_combo_count;

    },

});