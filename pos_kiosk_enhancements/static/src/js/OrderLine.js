/** @odoo-module **/

import { Orderline } from "@point_of_sale/app/store/models";
import { patch } from "@web/core/utils/patch";

patch(Orderline.prototype, {
     export_as_JSON() {
        if (Array.isArray(this.comboLines) && this.comboLines.some((l) => !l)) {
            this.comboLines = this.comboLines.filter(Boolean);
        }

        const json = super.export_as_JSON(...arguments);
        json.selected_qty = this.selected_qty || 0;
        json.paid_qty = this.paid_qty || 0;
        json.free_qty = this.free_qty || 0;
        json.combo_price = this.combo_price || 0;
        json.extra_price = this.extra_price || 0;
        json.allow_quantity = this.allow_quantity || false;
         json.combo_line_ids = (json.combo_line_ids || []).filter(
            (id) => id !== undefined && id !== null
        );

        if (!json.combo_parent_id) {
            json.combo_parent_id = false;
        }

        if (!json.combo_line_id) {
            json.combo_line_id = false;
        }

        return json;
    },
    init_from_JSON(json) {
        super.init_from_JSON(...arguments);
        this.selected_qty = json.selected_qty || 0;
        this.paid_qty = json.paid_qty || 0;
        this.free_qty = json.free_qty || 0;
        this.combo_price = json.combo_price || 0;
        this.extra_price = json.extra_price || 0;
        this.allow_quantity = json.allow_quantity || false;
    },
    getDisplayData() {
        const data = super.getDisplayData(...arguments);
        data.uuid = this.uuid;
        data.selected_qty = this.selected_qty || 0;
        data.free_qty = this.free_qty || 0;
        data.paid_qty = this.paid_qty || 0;
        if (this.comboParent) {
            data.display_qty =
                this.selected_qty || this.get_quantity();
            data.display_unit_price =
                this.paid_qty > 0
                    ? this.combo_price
                    : 0;
        } else {
            data.display_qty = data.qty;
            data.display_unit_price = data.unitPrice;
        }
        return data;
    },
});