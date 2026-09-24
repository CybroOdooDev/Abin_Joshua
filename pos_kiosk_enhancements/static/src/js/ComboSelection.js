/** @odoo-module **/

import {patch} from "@web/core/utils/patch";
import {
    ComboSelection
} from "@pos_self_order/app/components/combo_selection/combo_selection";
import {onWillUpdateProps} from "@odoo/owl";
import {useService} from "@web/core/utils/hooks";
import {_t} from "@web/core/l10n/translation";

patch(ComboSelection.prototype, {
    setup() {
        this.notification = useService("notification");
        super.setup();

        this._initLines(this.props);

        onWillUpdateProps((nextProps) => {
            this._initLines(nextProps);
        });
    },

    _initLines(props) {
        const comboState = props.comboState;
        const combo = props.combo;

        comboState.lines = comboState.lines || {};
        comboState.selectionOrder = comboState.selectionOrder || [];
        comboState.selectedComboLineIds = comboState.selectedComboLineIds || [];

        combo.combo_line_ids.forEach((line) => {
            if (!comboState.lines[line.id]) {
                comboState.lines[line.id] = {
                    qty: 0,
                    selected: false,
                };
            }
        });
    },

    productClicked(lineId) {
        const combo = this.props.combo;
        const comboState = this.props.comboState;
        const state = comboState.lines[lineId];

        if (!state) {
            return;
        }

        comboState.selectionOrder = comboState.selectionOrder || [];
        comboState.selectedComboLineIds = comboState.selectedComboLineIds || [];

        const order = comboState.selectionOrder;
        const selectedIds = comboState.selectedComboLineIds;

        const orderIndex = order.indexOf(lineId);
        const selectedIndex = selectedIds.indexOf(lineId);

        // If quantity is disabled, select once and move next immediately
        if (!combo.allow_quantity) {
            state.selected = true;
            state.qty = 1;

            if (orderIndex !== -1) {
                order.splice(orderIndex, 1);
            }
            order.push(lineId);

            if (selectedIndex === -1) {
                selectedIds.push(lineId);
            }

            this.render();
            setTimeout(() => {
                this.goNextStep();
            }, 0);
            return;
        }

        if (state.selected) {
            state.selected = false;
            state.qty = 0;

            if (orderIndex !== -1) {
                order.splice(orderIndex, 1);
            }

            if (selectedIndex !== -1) {
                selectedIds.splice(selectedIndex, 1);
            }
        } else {
            state.selected = true;
            state.qty = state.qty || 1;

            if (orderIndex !== -1) {
                order.splice(orderIndex, 1);
            }
            order.push(lineId);

            if (selectedIndex === -1) {
                selectedIds.push(lineId);
            }
        }

        this.render();
    },
    _hasExtraSelection() {
        const combo = this.props.combo;
        const comboState = this.props.comboState;
        const lines = comboState.lines || {};

        if (!combo.free_limit) {
            return false;
        }

        let totalQty = 0;

        for (const lineId in lines) {
            const state = lines[lineId];
            if (state && state.selected) {
                totalQty += combo.allow_quantity ? Number(state.qty || 0) : 1;
            }
        }

        return totalQty > Number(combo.free_limit || 0);
    },
    get freeLimitMessage() {
        return _t(
            "You can choose %s free item(s) from this choice. Extra selections will be charged.",
            this.props.combo.free_limit
        );
    },
    increaseQty(lineId, ev) {
        ev.stopPropagation();

        if (!this.props.combo.allow_quantity) {
            return;
        }

        const comboState = this.props.comboState;
        const state = comboState.lines[lineId];

        if (!state) {
            return;
        }

        comboState.selectionOrder = comboState.selectionOrder || [];
        comboState.selectedComboLineIds = comboState.selectedComboLineIds || [];

        // If not selected yet, select it directly from plus click
        if (!state.selected) {
            state.selected = true;
            state.qty = 0;

            const orderIndex = comboState.selectionOrder.indexOf(lineId);
            if (orderIndex !== -1) {
                comboState.selectionOrder.splice(orderIndex, 1);
            }
            comboState.selectionOrder.push(lineId);

            if (!comboState.selectedComboLineIds.includes(lineId)) {
                comboState.selectedComboLineIds.push(lineId);
            }
        }

        state.qty = Number(state.qty || 0) + 1;

        this.render();
    },
    decreaseQty(lineId, ev) {
        ev.stopPropagation();

        if (!this.props.combo.allow_quantity) {
            return;
        }

        const comboState = this.props.comboState;
        const state = comboState.lines[lineId];

        if (!state) {
            return;
        }

        state.qty = Math.max(0, state.qty - 1);

        if (state.qty === 0) {
            state.selected = false;

            const orderIndex = comboState.selectionOrder.indexOf(lineId);
            if (orderIndex !== -1) {
                comboState.selectionOrder.splice(orderIndex, 1);
            }

            const selectedIndex = comboState.selectedComboLineIds.indexOf(lineId);
            if (selectedIndex !== -1) {
                comboState.selectedComboLineIds.splice(selectedIndex, 1);
            }
        }

        this.render();
    },
    _getLineExtraInfo(lineId) {
        const combo = this.props.combo;
        const state = this.props.comboState.lines[lineId];

        if (!state || !state.selected) {
            return {
                show: false,
                paidQty: 0,
                extraPrice: 0,
            };
        }

        const order = this.props.comboState.selectionOrder || [];
        let remainingFree = combo.free_limit || 0;

        for (const selectedLineId of order) {
            const selectedState = this.props.comboState.lines[selectedLineId];

            if (!selectedState || !selectedState.selected) {
                continue;
            }

            const line = combo.combo_line_ids.find((l) => l.id === selectedLineId);
            if (!line) {
                continue;
            }

            const qty = combo.allow_quantity ? selectedState.qty || 1 : 1;
            const freeQty = Math.min(qty, remainingFree);
            const paidQty = Math.max(qty - freeQty, 0);

            remainingFree = Math.max(remainingFree - freeQty, 0);

            if (selectedLineId === lineId) {
                const unitPrice = line.combo_price || line.price_extra || line.price || 0;
                const extraPrice = paidQty * unitPrice;

                return {
                    show: paidQty > 0 && extraPrice > 0,
                    paidQty,
                    extraPrice,
                };
            }
        }

        return {
            show: false,
            paidQty: 0,
            extraPrice: 0,
        };
    },
    formatExtraPrice(value) {
        return Number(value || 0).toFixed(2);
    },
    goNextStep() {
        const combo = this.props.combo;
        const comboState = this.props.comboState;
        const lines = comboState.lines || {};
        const order = comboState.selectionOrder || [];

        const selectedLineIds = order.filter((lineId) => {
            const state = lines[lineId];
            return state && state.selected && Number(state.qty || 0) > 0;
        });

        if (!selectedLineIds.length) {
            this.notification.add(
                _t(`Please select at least one item from ${combo.name}.`),
                {type: "warning"}
            );
            return;
        }

        let remainingFree = combo.free_limit || 0;
        const selectedCombos = [];

        selectedLineIds.forEach((lineId) => {
            const line = combo.combo_line_ids.find((l) => l.id === lineId);
            const state = lines[lineId];

            if (!line || !state || !state.selected) {
                return;
            }

            const qty = combo.allow_quantity ? state.qty || 1 : 1;

            const productId = Array.isArray(line.product_id)
                ? line.product_id[0]
                : line.product_id;

            const product = this.selfOrder.productByIds[productId];

            const freeQty = Math.min(qty, remainingFree);
            const paidQty = qty - freeQty;

            remainingFree = Math.max(remainingFree - freeQty, 0);

            selectedCombos.push({
                combo_line_id: line.id,
                product,
                quantity: qty,
                free_qty: freeQty,
                paid_qty: paidQty,
                price: line.combo_price || 0,
            });
        });

        if (!selectedCombos.length) {
            this.notification.add(
                _t(`Please select a valid item from ${combo.name}.`),
                {type: "warning"}
            );
            return;
        }
        comboState.selectedProduct = selectedCombos[0].product;

        if (!comboState.selectedProduct || !comboState.selectedProduct.id) {
            this.notification.add(
                _t("Selected product is not available. Please choose another item."),
                {type: "warning"}
            );
            return;
        }

        this.selfOrder._comboSelections = this.selfOrder._comboSelections || {};
        this.selfOrder._comboSelections[combo.id] = selectedCombos;

        this.props.next();
    },
});