/** @odoo-module **/

import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";
import { patch } from "@web/core/utils/patch";
import { parseFloat } from "@web/views/fields/parsers";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { _t } from "@web/core/l10n/translation";

function round(value) {
    return Math.round((Number(value) || 0) * 1000000) / 1000000;
}

patch(TicketScreen.prototype, {
    /**
     * WORKFLOW:
     * - Selecting the combo PARENT line and typing a quantity refunds the
     *   whole combo: every choice line is refunded by the same proportion of
     *   the combo being refunded.
     * - Selecting an individual choice line (has a comboParent) refunds ONLY
     *   that line, on its own, no cascading to siblings or parent.
     *
     * The cashier always works in the VISIBLE quantity shown on the line.
     * For a combo choice line the visible quantity is `selected_qty` (the
     * number the customer chose), NOT the core `quantity` field - which the
     * kiosk sets to `paid_qty` and is therefore 0 for any item included in
     * the combo price. Driving the refund off `selected_qty` is what makes
     * every choice line (free/included or paid extra) selectable again; the
     * money side is reconciled in _prepareRefundOrderlineOptions.
     */
    _visibleRefundQty(line) {
        return line.comboParent
            ? Math.abs(line.selected_qty || line.get_quantity())
            : Math.abs(line.get_quantity());
    },

    _onUpdateSelectedOrderline({ key, buffer }) {
        const order = this.getSelectedOrder();
        if (!order) {
            return this.numberBuffer.reset();
        }

        const selectedOrderlineId = this.getSelectedOrderlineId();
        const orderline = order.orderlines.find((line) => line.id == selectedOrderlineId);
        if (!orderline) {
            return this.numberBuffer.reset();
        }

        const isComboParentSelected =
            !orderline.comboParent && orderline.comboLines?.length > 0;
        const linesToUpdate = isComboParentSelected
            ? orderline.getAllLinesInCombo()
            : [orderline];

        const requestedQty =
            buffer == null || buffer === "" ? 0 : Math.abs(parseFloat(buffer));
        const parentVisibleQty = this._visibleRefundQty(orderline);
        const ratio =
            isComboParentSelected && parentVisibleQty
                ? requestedQty / parentVisibleQty
                : 1;

        for (const line of linesToUpdate) {
            const toRefundDetail = this._getToRefundDetail(line);

            // When already linked to an order, do not modify the to refund quantity.
            if (toRefundDetail.destinationOrderUid) {
                return this.numberBuffer.reset();
            }

            if (requestedQty === 0) {
                toRefundDetail.qty = 0;
                continue;
            }

            const refundableQty =
                this._visibleRefundQty(line) - Math.abs(line.refunded_qty || 0);

            // Nothing left to refund on this line. Skip it during a combo
            // cascade; only abort when it's the single line the cashier picked.
            if (refundableQty <= 0) {
                toRefundDetail.qty = 0;
                if (line === orderline && !isComboParentSelected) {
                    return this.numberBuffer.reset();
                }
                continue;
            }

            const lineQty =
                line === orderline ? requestedQty : round(ratio * this._visibleRefundQty(line));

            if (lineQty > refundableQty + 1e-9) {
                // The line the cashier typed into is a hard error - they asked
                // for more than exists. A sibling overshooting its own remaining
                // quantity during a combo cascade is NOT an error: clamp it to
                // whatever is still refundable (e.g. a choice line already
                // partly refunded earlier) and keep going so the rest of the
                // combo is still selected.
                if (line === orderline) {
                    this.numberBuffer.reset();
                    this.popup.add(ErrorPopup, {
                        title: _t("Maximum Exceeded"),
                        body: _t(
                            "The requested quantity to be refunded is higher than the ordered quantity. %s is requested while only %s can be refunded.",
                            lineQty,
                            refundableQty
                        ),
                    });
                    return;
                }
                toRefundDetail.qty = round(refundableQty);
                continue;
            }

            toRefundDetail.qty = lineQty;
        }
    },

    /**
     * Core already creates a toRefundDetail for every line it's asked about
     * via _onUpdateSelectedOrderline above. We only need the kiosk/combo
     * pricing fields to survive onto the snapshot so the refund line can
     * rebuild the correct price later.
     */
    _getToRefundDetail(orderline) {
        const detail = super._getToRefundDetail(...arguments);
        Object.assign(detail.orderline, {
            isComboLine: Boolean(orderline.comboParent || orderline.comboLines?.length),
            selected_qty: orderline.selected_qty || 0,
            paid_qty: orderline.paid_qty || 0,
            free_qty: orderline.free_qty || 0,
            combo_price: orderline.combo_price || 0,
            extra_price: orderline.extra_price || 0,
            allow_quantity: orderline.allow_quantity || false,
        });
        return detail;
    },

    /**
     * Carry the combo pricing metadata into the options used to create the
     * refund orderline.
     *
     * For a combo CHOICE line `qty` is the VISIBLE (selected) quantity being
     * refunded - see _onUpdateSelectedOrderline. The refund line is created
     * with that visible quantity (so stock + displayed qty stay correct), but
     * its unit price is back-solved from the PAID portion so the money exactly
     * reverses what was charged (paid_qty * combo_price). Included items have
     * paid_qty 0, so they refund at price 0 - inventory only, no money.
     *
     * The combo PARENT line is left to core handling (its unit price already
     * carries the whole combo base price).
     */
    _prepareRefundOrderlineOptions(toRefundDetail) {
        const options = super._prepareRefundOrderlineOptions(...arguments);
        const { qty, orderline } = toRefundDetail;

        if (orderline.isComboLine && orderline.comboParent) {
            const selectedTotal = Math.abs(
                orderline.selected_qty || orderline.qty || qty || 1
            );
            const ratio = selectedTotal ? qty / selectedTotal : 0;
            const paidQtyRefunded = round(ratio * Math.abs(orderline.paid_qty || 0));
            const freeQtyRefunded = round(qty - paidQtyRefunded);
            const refundAmount = round(paidQtyRefunded * Math.abs(orderline.combo_price || 0));

            // visible units returned; unit price keeps the subtotal exact
            options.quantity = -qty;
            options.price = qty ? round(refundAmount / qty) : 0;
            options.combo_price = orderline.combo_price || 0;
            options.extra_price = orderline.extra_price || 0;
            options.allow_quantity = orderline.allow_quantity || false;
            options.free_qty = -freeQtyRefunded;
            options.paid_qty = -paidQtyRefunded;
            options.selected_qty = -qty;
        }
        return options;
    },
    _getEmptyOrder(partner) {
        const order = super._getEmptyOrder(...arguments);
        if (order && !this.pos.get_order()) {
            this.pos.set_order(order);
        }
        return order;
    },
});
