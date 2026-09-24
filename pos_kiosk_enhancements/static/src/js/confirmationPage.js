/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ConfirmationPage } from "@pos_self_order/app/pages/confirmation_page/confirmation_page";

function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function round(value) {
    return Math.round(num(value) * 1000000) / 1000000;
}

patch(ConfirmationPage.prototype, {
    async initOrder() {
        await super.initOrder(...arguments);

        if (!this.confirmedOrder?.lines?.length) {
            return;
        }

        const overrides = this.selfOrder._comboPriceOverrides || new Map();

        for (const line of this.confirmedOrder.lines) {
            const override = overrides.get(line.uuid);
            if (!override) {
                continue;
            }

            const qty = num(override.qty, line.qty || 1);
            const paidQty = num(override.paidQty, 0);
            const originalUnitPrice = num(
                override.originalUnitPrice ??
                override.unitPrice ??
                line._originalUnitPrice ??
                line.price_unit ??
                0
            );

            const paidTotal = round(paidQty * originalUnitPrice);
            const backendUnitPrice = qty > 0 ? round(paidTotal / qty) : 0;

            line.qty = qty;
            line.price_unit = backendUnitPrice;
            line.discount = 0;
            line.price_subtotal = paidTotal;
            line.price_subtotal_incl = paidTotal;
            line._freeQty = num(override.freeQty, 0);
            line._paidQty = paidQty;
        }

        this.confirmedOrder.amount_total = round(
            this.confirmedOrder.lines.reduce((sum, line) => {
                return sum + num(line.price_subtotal_incl);
            }, 0)
        );
    },
});