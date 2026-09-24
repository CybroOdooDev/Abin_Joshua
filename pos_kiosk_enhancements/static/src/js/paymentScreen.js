/** @odoo-module **/

import {PaymentScreen} from "@point_of_sale/app/screens/payment_screen/payment_screen";
import {patch} from "@web/core/utils/patch";

function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function round(value) {
    return Math.round(num(value) * 1000000) / 1000000;
}

patch(PaymentScreen.prototype, {
    async _finalizeValidation() {
        const order = this.pos.get_order();
        const comboTaxPayload = order._buildComboTaxPayload();

        if (comboTaxPayload.length) {
            const taxResult = await this.orm.call(
                "pos.order",
                "compute_pos_combo_tax_breakdown",
                [comboTaxPayload]
            );
            const taxDetails = (taxResult.tax_details || []).map((line) => ({
                tax: {...(line.tax || {})},
                amount: num(line.amount),
                base: num(line.base),
            }));
            const posTotalTax = round(order.get_total_tax());
            const breakdownTotal = round(
                taxDetails.reduce(
                    (sum, line) => sum + line.amount,
                    0
                )
            );
            if (
                breakdownTotal > 0 &&
                Math.abs(posTotalTax - breakdownTotal) >= 0.000001
            ) {
                const factor = posTotalTax / breakdownTotal;
                taxDetails.forEach((line) => {
                    line.amount = round(line.amount * factor);
                });
                const scaledTotal = round(
                    taxDetails.reduce(
                        (sum, line) => sum + line.amount,
                        0
                    )
                );
                const roundingDiff = round(
                    posTotalTax - scaledTotal
                );
                if (Math.abs(roundingDiff) >= 0.000001) {
                    taxDetails.sort((a, b) => b.amount - a.amount);

                    taxDetails[0].amount = round(
                        taxDetails[0].amount + roundingDiff
                    );
                }
            }
            order.combo_tax_details = taxDetails;
            order.combo_tax_amount = round(
                taxDetails.reduce(
                    (sum, line) => sum + line.amount,
                    0
                )
            );
        }
        await super._finalizeValidation(...arguments);
    },
});