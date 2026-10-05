/** @odoo-module **/

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { _t } from "@web/core/l10n/translation";
import { useState } from "@odoo/owl";

export class AppetizerSelectionPopup extends AbstractAwaitablePopup {
    static template = "pos_kitchen_display.AppetizerSelectionPopup";
    static props = { "*": true };
    static defaultProps = {
        title: _t("Select Appetizer"),
        cancelText: _t("Skip"),
        confirmText: _t("Confirm"),
        products: [],
        tableName: "",
        dinersCount: 1,
    };

    setup() {
        super.setup();
        const firstProduct = this.props.products[0] || null;
        const initialQty = Math.max(1, parseInt(this.props.dinersCount, 10) || 1);
        this.state = useState({
            selectedProductId: firstProduct ? firstProduct.id : null,
            quantity: initialQty,
        });
    }

    selectProduct(productId) {
        this.state.selectedProductId = productId;
    }

    updateQuantity(delta) {
        const current = parseInt(this.state.quantity, 10) || 1;
        const next = current + delta;
        if (next >= 1) {
            this.state.quantity = next;
        }
    }

    onQuantityChange(ev) {
        const val = parseInt(ev.target.value, 10);
        if (!isNaN(val) && val >= 1) {
            this.state.quantity = val;
        } else if (isNaN(val) || val < 1) {
            this.state.quantity = 1;
        }
    }

    get selectedProduct() {
        return this.props.products.find(p => p.id === this.state.selectedProductId) || null;
    }

    getPayload() {
        return {
            product: this.selectedProduct,
            quantity: Math.max(1, parseInt(this.state.quantity, 10) || 1),
        };
    }
}
