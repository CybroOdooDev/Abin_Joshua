/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ComboConfiguratorPopup } from "@point_of_sale/app/store/combo_configurator_popup/combo_configurator_popup";
import { useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

patch(ComboConfiguratorPopup.prototype, {
    setup() {
        super.setup();
        this.selectionSequence = 0;
        this.extraToppingState = useState({
            selections: {},
        });
    },
    areAllCombosSelected() {
        return this.props.product.combo_ids.every(
            comboId => {
                const combo =
                    this.pos.db.combo_by_id[comboId];
                if (combo.allow_quantity) {
                    return combo.combo_line_ids.some(
                        lineId =>
                            (this.getQty(lineId) || 0) > 0
                    );
                }
                return Boolean(
                    this.state.combo[comboId]
                );
            }
        );
    },

    getQty(comboLineId) {
        return this.extraToppingState.selections[comboLineId]?.qty || 0;
    },
    increaseQty(comboLine) {
        if (!this.extraToppingState.selections[comboLine.id]) {
            this.extraToppingState.selections[comboLine.id] = {
                qty: 0,
                freeQty: 0,
                paidQty: 0,
                sequence: ++this.selectionSequence,
            };
        }
        this.state.combo[comboLine.combo_id[0]] = comboLine.id;
        this.extraToppingState.selections[comboLine.id].qty++;
        this.computeFreeLimits(comboLine.combo_id[0]);
    },

    decreaseQty(comboLine) {
        const line = this.extraToppingState.selections[comboLine.id];
        if (!line) return;
        line.qty--;
        if (line.qty <= 0) {
            delete this.extraToppingState.selections[comboLine.id];
        }
        this.computeFreeLimits(comboLine.combo_id[0]);
    },
    getChargedQty(combo) {
        return combo.combo_line_ids.reduce((total, lineId) => {
            const item = this.extraToppingState.selections[lineId];
            return total + (item?.paidQty || 0);
        }, 0);
    },

    shouldShowFreeLimitWarning(combo) {
        return (
            (combo.free_limit || 0) > 0 &&
            this.getChargedQty(combo) > 0
        );
    },

    getLimitExceededMessage(combo) {
        return _t(
            "You can choose %s free item(s) from this choice. Extra selections will be charged."
        ).replace("%s", combo.free_limit);
    },
    computeFreeLimits(comboId) {
        const combo = this.pos.db.combo_by_id[comboId];
        const comboLines = combo.combo_line_ids
            .map(id => this.pos.db.combo_line_by_id[id]);
        // reset
        for (const comboLine of comboLines) {
            const item =
                this.extraToppingState.selections[comboLine.id];

            if (!item) {
                continue;
            }
            item.freeQty = 0;
            item.paidQty = 0;
        }
        // no free limit
        if (!combo.free_limit || combo.free_limit <= 0) {
            for (const comboLine of comboLines) {
                const item =
                    this.extraToppingState.selections[comboLine.id];
                if (!item) {
                    continue;
                }
                item.freeQty = 0;
                item.paidQty = item.qty;
                // item.freeQty = item.qty;
                // item.paidQty = 0;
            }
            return;
        }
        let remainingFree = combo.free_limit;
        // sort by user selection order
        const selectedLines = comboLines
            .filter(line =>
                this.extraToppingState.selections[line.id]
            )
            .sort((a, b) => {
                return (
                    this.extraToppingState.selections[a.id].sequence -
                    this.extraToppingState.selections[b.id].sequence
                );
            });
        for (const comboLine of selectedLines) {
            const item =
                this.extraToppingState.selections[comboLine.id];
            if (!item) {
                continue;
            }
            item.freeQty = Math.min(
                item.qty,
                remainingFree
            );
            item.paidQty =
                item.qty - item.freeQty;
            remainingFree -= item.freeQty;
        }
    },
    isQuantityAllowed(comboLine) {
        const combo = this.pos.db.combo_by_id[
            comboLine.combo_id[0]
        ];
        return !!combo.allow_quantity;
    },

    getRemainingFree(comboId) {
        const combo = this.pos.db.combo_by_id[comboId];
        if (!combo.free_limit) return 0;
        let used = 0;
        for (const lineId of combo.combo_line_ids) {
            const item = this.extraToppingState.selections[lineId];
            if (!item) continue;
            used += item.freeQty || 0;
        }
        return Math.max(0, combo.free_limit - used);
    },

    getExtraCharge(comboLine) {
        const item = this.extraToppingState.selections[comboLine.id];
        if (!item || !item.paidQty) return 0;
        return item.paidQty * comboLine.combo_price;
    },

    getComboBasePrice() {
        const product = this.props.product;
        if (!product) return 0;
        // Use pricelist if available, otherwise list_price
        if (this.pos.selectedPricelist) {
            return this.pos.computePriceAfterFp(
                product.get_price(this.pos.selectedPricelist, 1),
                { product }
            );
        }
        return product.lst_price || 0;
    },

    getTotalDisplayPrice() {
        const basePrice = this.getComboBasePrice();
        let extras = 0;
        for (const comboId of this.props.product.combo_ids) {
            const combo = this.pos.db.combo_by_id[comboId];
            for (const lineId of combo.combo_line_ids) {
                extras += this.getExtraCharge(
                    this.pos.db.combo_line_by_id[lineId]
                );
            }
        }
        return basePrice + extras;
    },
    getPayload() {
        const payload = [];

        // Quantity-enabled combos
        for (const [lineId, data] of Object.entries(this.extraToppingState.selections)) {
            if (!data.qty) {
                continue;
            }

            const comboLine = this.pos.db.combo_line_by_id[lineId];
            payload.push({
                ...comboLine,
                quantity: data.qty,
                free_qty: data.freeQty,
                paid_qty: data.paidQty,
                extra_price: data.paidQty * comboLine.combo_price,
            });
        }

        // Standard combos only
        for (const lineId of Object.values(this.state.combo)) {
            const comboLine = this.pos.db.combo_line_by_id[lineId];

            if (!comboLine || this.isQuantityAllowed(comboLine)) {
                continue;
            }

            payload.push({
                ...comboLine,
                quantity: 1,
            });
        }
        return payload;
    }
});