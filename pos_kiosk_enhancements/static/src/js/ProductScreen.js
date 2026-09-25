/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { _t } from "@web/core/l10n/translation";

patch(ProductScreen.prototype, {
    async _showReceiptProtectedPopup() {
        await this.popup.add(ErrorPopup, {
            title: _t("Receipt Already Created"),
            body: _t(
                "This order is locked because a receipt has already been created. You cannot add products or modify existing lines."
            ),
        });
    },

    async _setValue(val) {
        const order = this.pos.get_order();

        if (order?.is_receipt_protected) {
            this.numberBuffer.reset();
            await this._showReceiptProtectedPopup();
            return;
        }

        // Capture combo parent and its qty before super modifies it
        let comboParentLine = this.currentOrder.get_selected_orderline();
        if (comboParentLine?.comboParent) {
            comboParentLine = comboParentLine.comboParent;
        }
        const oldParentQty =
            val !== "remove" && comboParentLine?.comboLines?.length
                ? comboParentLine.get_quantity()
                : 0;

        const result = super._setValue(val);
        if (oldParentQty > 0 && comboParentLine?.comboLines?.length) {
            const newParentQty = comboParentLine.get_quantity();
            if (newParentQty !== oldParentQty) {
                const ratio = newParentQty / oldParentQty;

                for (const line of comboParentLine.comboLines) {
                    line.selected_qty = (line.selected_qty || 1) * ratio;

                    const newFree = Math.round((line.free_qty || 0) * ratio);
                    const newPaid = Math.round((line.paid_qty || 0) * ratio);

                    line.free_qty = newFree;
                    line.paid_qty = newPaid;
                    if (line.allow_quantity || line.extra_price > 0 || line.combo_price > 0) {
                        line.set_quantity(newPaid, true);
                    } else {
                        line.set_quantity(newParentQty, true);
                    }
                }
            }
        }

        return result;
    },
});