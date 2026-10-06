/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ComboConfiguratorPopup } from "@point_of_sale/app/store/combo_configurator_popup/combo_configurator_popup";
import { Order, Orderline } from "@point_of_sale/app/store/models";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { Orderline as OrderlineComponent } from "@point_of_sale/app/generic_components/orderline/orderline";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { Component } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { roundDecimals as round_di } from "@web/core/utils/numbers";
import { _t } from "@web/core/l10n/translation";

// 1. Patch ComboConfiguratorPopup to allow partial selections and pre-filled states
patch(ComboConfiguratorPopup.prototype, {
    setup() {
        super.setup(...arguments);
        if (this.props.selectedCombo) {
            this.state.combo = {
                ...this.state.combo,
                ...this.props.selectedCombo,
            };
        }
        if (this.props.configuration) {
            this.state.configuration = {
                ...this.state.configuration,
                ...this.props.configuration,
            };
        }
    },

    hasSelectedCombo() {
        return Object.values(this.state.combo).some((x) => Boolean(x));
    },

    clearComboChoice(comboId) {
        this.state.combo[comboId] = 0;
    },

    async onClickProduct({ product, combo_line }, ev) {
        const comboId = combo_line.combo_id[0];
        // If clicking already selected item, allow toggling it off to leave course pending
        if (this.state.combo[comboId] === combo_line.id) {
            ev.preventDefault();
            ev.stopPropagation();
            this.state.combo[comboId] = 0;
            delete this.state.configuration[combo_line.id];
            return;
        }
        return super.onClickProduct(...arguments);
    },
});

// 2. Patch Orderline Model to identify resumeable/pending combos
patch(Orderline.prototype, {
    getPendingComboCount() {
        if (!this.comboLines || !this.product?.combo_ids?.length) {
            return 0;
        }
        const selectedComboIds = new Set(
            this.comboLines
                .map((child) => child.comboLine?.combo_id?.[0])
                .filter(Boolean)
        );
        return this.product.combo_ids.filter((id) => !selectedComboIds.has(id)).length;
    },

    isResumeableCombo() {
        return Boolean(this.product?.combo_ids?.length && !this.comboParent);
    },

    getDisplayData() {
        const data = super.getDisplayData(...arguments);
        data.cid = this.cid;
        data.pendingComboCount = this.getPendingComboCount();
        data.isResumeableCombo = this.isResumeableCombo();
        return data;
    },
});

// 3. Patch Order Model to safely handle partial combo price calculations without division by zero
patch(Order.prototype, {
    compute_child_lines(comboParentProduct, comboLines, pricelist) {
        if (!comboLines || !comboLines.length) {
            return [];
        }
        const parentLstPrice = comboParentProduct.get_price(pricelist, 1);
        const originalTotal = comboLines.reduce((acc, comboLine) => {
            const originalPrice = this.pos.db.combo_by_id[comboLine.combo_id[0]]?.base_price || 0;
            return acc + originalPrice;
        }, 0);

        const combolines = [];
        let remainingTotal = parentLstPrice;

        for (let i = 0; i < comboLines.length; i++) {
            const comboLine = comboLines[i];
            const combo = this.pos.db.combo_by_id[comboLine.combo_id[0]];
            let priceUnit = 0;
            if (originalTotal !== 0 && isFinite(originalTotal)) {
                priceUnit = round_di(
                    (combo.base_price * parentLstPrice) / originalTotal,
                    this.pos.dp["Product Price"]
                );
            } else {
                priceUnit = round_di(parentLstPrice / comboLines.length, this.pos.dp["Product Price"]);
            }
            remainingTotal -= priceUnit;
            if (i === comboLines.length - 1) {
                priceUnit += remainingTotal;
            }
            const attribute_value_ids = comboLine.configuration?.attribute_value_ids;
            const attributesPriceExtra = (attribute_value_ids ?? [])
                .map((id) => this.pos.db.attribute_value_by_id[id]?.price_extra || 0)
                .reduce((acc, price) => acc + price, 0);
            const totalPriceExtra = priceUnit + attributesPriceExtra + (comboLine.combo_price || 0);
            combolines.push({ comboLine: comboLine, price: totalPriceExtra, attribute_value_ids });
        }
        return combolines;
    },
});

// 4. Patch PosStore to handle Reopening / Resuming the Combo Menu
patch(PosStore.prototype, {
    async resumeComboOrderline(parentLine) {
        if (!parentLine) return;
        const currentOrder = this.get_order();
        if (!currentOrder) return;

        // Gather existing child selections
        const existingCombo = {};
        const existingConfig = {};
        for (const child of (parentLine.comboLines || [])) {
            if (child.comboLine) {
                const comboId = child.comboLine.combo_id[0];
                existingCombo[comboId] = child.comboLine.id;
                if (child.comboLine.configuration) {
                    existingConfig[child.comboLine.id] = child.comboLine.configuration;
                }
            }
        }

        const popupService = this.env.services.popup;
        const { confirmed, payload } = await popupService.add(ComboConfiguratorPopup, {
            product: parentLine.product,
            selectedCombo: existingCombo,
            configuration: existingConfig,
            isEdit: true,
        });

        if (!confirmed) {
            return;
        }

        const newComboLines = payload;
        const existingChildrenByComboId = {};
        for (const child of [...(parentLine.comboLines || [])]) {
            if (child.comboLine) {
                existingChildrenByComboId[child.comboLine.combo_id[0]] = child;
            }
        }

        let hasChanges = false;

        for (const comboLine of newComboLines) {
            const comboId = comboLine.combo_id[0];
            const existingChild = existingChildrenByComboId[comboId];

            let platingLevelId = undefined;
            if (this.pos_plating_level && this.pos_plating_level.length) {
                const comboRecord = this.db.combo_by_id[comboId];
                const comboName = (comboRecord?.name || "").toLowerCase();
                const foundLevel = this.pos_plating_level.find(
                    (l) => comboName.includes(l.name.toLowerCase()) || l.name.toLowerCase().includes(comboName)
                );
                if (foundLevel) {
                    platingLevelId = foundLevel.id;
                }
            }

            if (existingChild) {
                // If selection changed
                if (existingChild.comboLine.id !== comboLine.id) {
                    currentOrder.remove_orderline(existingChild);
                    const idx = parentLine.comboLines.indexOf(existingChild);
                    if (idx > -1) {
                        parentLine.comboLines.splice(idx, 1);
                    }

                    await this.addProductFromUi(
                        this.db.product_by_id[comboLine.product_id[0]],
                        {
                            price: comboLine.combo_price || 0,
                            comboParent: parentLine,
                            comboLine: comboLine,
                            plating_level_id: platingLevelId,
                            attribute_value_ids: comboLine.configuration?.attribute_value_ids,
                            attribute_custom_values: comboLine.configuration?.attribute_custom_values,
                            extras: { price_type: "manual" },
                        }
                    );
                    hasChanges = true;
                }
                delete existingChildrenByComboId[comboId];
            } else {
                // Newly added course (e.g. Dessert!)
                await this.addProductFromUi(
                    this.db.product_by_id[comboLine.product_id[0]],
                    {
                        price: comboLine.combo_price || 0,
                        comboParent: parentLine,
                        comboLine: comboLine,
                        plating_level_id: platingLevelId,
                        attribute_value_ids: comboLine.configuration?.attribute_value_ids,
                        attribute_custom_values: comboLine.configuration?.attribute_custom_values,
                        extras: { price_type: "manual" },
                    }
                );
                hasChanges = true;
            }
        }

        // Remove any choice that was deselected
        for (const comboId in existingChildrenByComboId) {
            const removedChild = existingChildrenByComboId[comboId];
            currentOrder.remove_orderline(removedChild);
            const idx = parentLine.comboLines.indexOf(removedChild);
            if (idx > -1) {
                parentLine.comboLines.splice(idx, 1);
            }
            hasChanges = true;
        }

        if (hasChanges) {
            currentOrder.send_to_kitchen = true;
            if (typeof this.sendOrderInPreparationUpdateLastChange === "function") {
                await this.sendOrderInPreparationUpdateLastChange(currentOrder);
            }
        }
    },
});

// 5. Patch OrderlineComponent to enable clicking the Resume badge directly on the cart line
patch(OrderlineComponent.prototype, {
    async resumeCombo(displayLine) {
        const order = this.pos.get_order();
        if (!order) return;
        const line = order.get_orderlines().find(
            (l) => l.cid === displayLine.cid || l.id === displayLine.id
        );
        const parentLine = line ? (line.comboParent || line) : null;
        if (parentLine) {
            await this.pos.resumeComboOrderline(parentLine);
        }
    },
});

// 6. Add Control Button "Resume Menu" on ProductScreen
export class ResumeMenuButton extends Component {
    static template = "pos_kitchen_display.ResumeMenuButton";

    setup() {
        this.pos = usePos();
    }

    get selectedLine() {
        return this.pos.get_order()?.get_selected_orderline();
    }

    get comboParentLine() {
        const line = this.selectedLine;
        if (!line) return null;
        if (line.comboParent) return line.comboParent;
        if (line.isResumeableCombo && line.isResumeableCombo()) return line;
        return null;
    }

    get pendingCount() {
        return this.comboParentLine?.getPendingComboCount() || 0;
    }

    async click() {
        const parentLine = this.comboParentLine;
        if (parentLine) {
            await this.pos.resumeComboOrderline(parentLine);
        }
    }
}

ProductScreen.addControlButton({
    component: ResumeMenuButton,
    condition: function () {
        const line = this.pos.get_order()?.get_selected_orderline();
        return Boolean(line && (line.comboParent || (line.isResumeableCombo && line.isResumeableCombo())));
    },
});
