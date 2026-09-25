/** @odoo-module **/

import {patch} from "@web/core/utils/patch";
import {ComboPage} from "@pos_self_order/app/pages/combo_page/combo_page";
import {SelfOrder} from "@pos_self_order/app/self_order_service";
import {CartPage} from "@pos_self_order/app/pages/cart_page/cart_page";
import {_t} from "@web/core/l10n/translation";

function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function round(value) {
    return Math.round(num(value) * 1000000) / 1000000;
}

patch(SelfOrder.prototype, {
    async getPricesFromServer() {
        await super.getPricesFromServer(...arguments);
        this._applyComboPriceOverrides();
    },
    async sendDraftOrderToServer() {
        const order = this.currentOrder;

        if (order?.lines?.length) {
            const overrides = this._comboPriceOverrides || new Map();

            for (const line of order.lines) {
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

                // Only final backend values
                line.qty = qty;
                line.price_unit = backendUnitPrice;
                line.discount = 0;
                line.price_subtotal = paidTotal;
                line.price_subtotal_incl = paidTotal;

                line._freeQty = num(override.freeQty, 0);
                line._paidQty = paidQty;
            }

            order.amount_total = round(
                order.lines.reduce((sum, line) => {
                    return sum + num(line.price_subtotal_incl);
                }, 0)
            );

            order.amount_paid = 0;
            order.amount_return = 0;
        }
        return await super.sendDraftOrderToServer(...arguments);
    },

    _applyComboPriceOverrides() {
        const order = this.currentOrder;
        const overrides = this._comboPriceOverrides;

        if (!order?.lines?.length || !overrides?.size) return;

        for (const line of order.lines) {
            const override = overrides.get(line.uuid);
            if (!override) continue;

            line.qty = override.qty;
            line.price_unit = override.price_unit;
            line.discount = 0;
            line.price_subtotal = override.price_subtotal;
            line.price_subtotal_incl = override.price_subtotal_incl;
            line._freeQty = override.freeQty;
            line._paidQty = override.paidQty;
        }

        order.amount_total = round(
            order.lines.reduce((sum, line) => {
                return sum + num(line.price_subtotal_incl);
            }, 0)
        );
        order.amount_paid = 0;
        order.amount_return = 0;
    },
});

patch(CartPage.prototype, {
    get _t() {
        return _t;
    },
    getPrice(line) {
        let total = num(line.price_subtotal_incl);

        const childLines = this.getChildLines(line);
        for (const child of childLines) {
            total += num(child.price_subtotal_incl);
        }

        return round(total);
    },
});

patch(ComboPage.prototype, {
    getAttributeSelected(combo) {
        try {
            const variants = combo?.variants || {};
            return Object.values(variants).flat();
        } catch {
            return [];
        }
    },

    async addToCart() {
        const comboSelections = this.selfOrder._comboSelections || {};
        const selections = Object.values(comboSelections).flat();

        const groupedMap = new Map();

        for (const sel of selections) {
            const productId = sel.product.id;
            const qty = num(sel.quantity);
            const freeQty = num(sel.free_qty);
            const paidQty = num(sel.paid_qty);
            const unitPrice = num(sel.price);

            if (!groupedMap.has(productId)) {
                groupedMap.set(productId, {
                    qty: 0,
                    freeQty: 0,
                    paidQty: 0,
                    unitPrice,
                    totalPrice: 0,
                });
            }

            const data = groupedMap.get(productId);
            data.qty += qty;
            data.freeQty += freeQty;
            data.paidQty += paidQty;
            data.totalPrice += paidQty * unitPrice;
        }

        await super.addToCart(...arguments);

        const order = this.selfOrder.currentOrder;
        if (!order?.lines?.length) return;

        const parent = order.lines
            .filter(line =>
                line.product_id === this.props.product.id &&
                !line.combo_parent_uuid
            )
            .slice(-1)[0];

        if (!parent) return;

        const childLines = order.lines.filter(
            line => line.combo_parent_uuid === parent.uuid
        );

        this.selfOrder._comboPriceOverrides =
            this.selfOrder._comboPriceOverrides || new Map();

        const parentProduct = (this.selfOrder.products || []).find(
            product => product.id === parent.product_id
        );

        const parentPrice = num(
            parentProduct?.price_info?.display_price_default ??
            parentProduct?.lst_price ??
            parentProduct?.price ??
            parentProduct?.list_price
        );

        const parentQty = num(parent.qty, 1) || 1;
        const parentTotal = round(parentPrice * parentQty);

        parent.qty = parentQty;
        parent.price_unit = parentPrice;
        parent.discount = 0;
        parent.price_subtotal = parentTotal;
        parent.price_subtotal_incl = parentTotal;

        this.selfOrder._comboPriceOverrides.set(parent.uuid, {
            qty: parentQty,
            price_unit: parentPrice,
            discount: 0,
            price_subtotal: parentTotal,
            price_subtotal_incl: parentTotal,
            freeQty: 0,
            paidQty: parentQty,
        });

        for (const line of childLines) {
            const data = groupedMap.get(line.product_id);
            if (!data) {
                line.qty = parentQty;
                continue;
            }

            const unitQty = num(data.qty) || 1;
            const totalQty = unitQty * parentQty;
            const unitFree = num(data.freeQty);
            const unitPaid = num(data.paidQty);
            const totalFree = unitFree * parentQty;
            const totalPaid = unitPaid * parentQty;
            const singleUnitPrice = num(data.unitPrice);
            const totalPrice = round(totalPaid * singleUnitPrice);
            const correctedUnitPrice = totalQty > 0 ? round(totalPrice / totalQty) : 0;

            line.qty = totalQty;
            line.price_unit = correctedUnitPrice;
            line.discount = 0;
            line.price_subtotal = totalPrice;
            line.price_subtotal_incl = totalPrice;
            line._freeQty = totalFree;
            line._paidQty = totalPaid;
            this.selfOrder._comboPriceOverrides.set(line.uuid, {
                qty: totalQty,
                price_unit: correctedUnitPrice,
                discount: 0,
                price_subtotal: totalPrice,
                price_subtotal_incl: totalPrice,
                freeQty: totalFree,
                paidQty: totalPaid,
                freeLimit: num(this.currentCombo?.free_limit || 0),
                originalUnitPrice: singleUnitPrice,
            });
        }
        this.selfOrder._applyComboPriceOverrides();
        await this.selfOrder.getPricesFromServer();
        this.selfOrder._applyComboPriceOverrides();
        this.selfOrder._comboSelections = {};
    },

    next() {
        const combo = this.currentCombo;
        const comboId = combo.id;
        const selections = this.selfOrder._comboSelections?.[comboId] || [];
        if (!selections.length) {
            return super.next(...arguments);
        }

        this.state.selectedCombos = this.state.selectedCombos.filter(
            selected => selected.combo_group_id !== comboId
        );

        selections.forEach(sel => {
            this.state.selectedCombos.push({
                combo_group_id: comboId,
                id: combo.id,
                name: combo.name,
                combo_line_id: sel.combo_line_id,

                product: {
                    id: sel.product.id,
                    name:
                        num(sel.quantity) > 1
                            ? `${sel.product.name} ×${sel.quantity}`
                            : sel.product.name,
                    variants: {},
                    customValues: {},
                },

                extra_products: selections.map(s => ({
                    id: s.product.id,
                    name: s.product.name,
                    qty: num(s.quantity),
                    price: num(s.price),
                    free_qty: num(s.free_qty),
                    paid_qty: num(s.paid_qty),
                })),
            });
        });

        this.resetState();

        if (this.state.editMode) {
            this.state.editMode = false;
            this.state.showResume = true;
            this.state.showQtyButtons = true;
            return;
        }

        this.state.currentComboIndex++;

        if (this.state.currentComboIndex === this.props.product.pos_combo_ids.length) {
            this.state.showResume = true;
        }
    },
});