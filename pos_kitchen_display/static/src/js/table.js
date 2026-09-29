/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Table } from "@pos_restaurant/app/floor_screen/table";
import { FloorScreen } from "@pos_restaurant/app/floor_screen/floor_screen";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { AppetizerSelectionPopup } from "@pos_kitchen_display/js/appetizer_selection_popup";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { useState, onWillStart, onWillUpdateProps } from "@odoo/owl";

patch(Table.prototype, {
    setup() {
        super.setup();
        this.pos = useService("pos");
        this.kitchenState = useState({ isReady: false });

        const syncReady = () => {
            const floorId = this.props.table.floor_id?.[0] ?? this.props.table.floor_id;
            const tableId = this.props.table.id;
            const floorSet = this.pos.readyTables.get(floorId);
            this.kitchenState.isReady = !!(floorSet && floorSet.has(tableId));
        };
        const bus = this.pos.env.services.bus_service;
        const onNotification = ({ detail: notifications }) => {
            for (const notif of notifications) {
                if (notif.type === "kitchen_order_ready") {
                    Promise.resolve().then(syncReady);
                }
                if (notif.type === "table_closed") {
                    const { floor_id, table_id } = notif.payload;

                    if (floor_id && this.pos.readyTables.has(floor_id)) {
                        this.pos.readyTables.get(floor_id).delete(table_id);
                    }
                    Promise.resolve().then(syncReady);
                }
            }
        };

        onWillStart(() => {
            syncReady();
            bus.addEventListener("notification", onNotification);
        });

        // Keep in sync if the parent passes a different table prop.
        onWillUpdateProps((nextProps) => {
            const floorId = nextProps.table.floor_id?.[0] ?? nextProps.table.floor_id;
            const tableId = nextProps.table.id;
            const floorSet = this.pos.readyTables.get(floorId);
            this.kitchenState.isReady = !!(floorSet && floorSet.has(tableId));
        });

        this.onMarkServed = (ev) => {
            ev.stopPropagation();
            const floorId = this.props.table.floor_id?.[0] ?? this.props.table.floor_id;
            const tableId = this.props.table.id;

            if (floorId && this.pos.readyTables.has(floorId)) {
                this.pos.readyTables.get(floorId).delete(tableId);
            }
            this.kitchenState.isReady = false;
        };
    },

    get isKitchenReady() {
        return this.kitchenState.isReady;
    }
});

// Patch FloorScreen to automatically prompt for number of diners and appetizer when opening a new table
patch(FloorScreen.prototype, {
    async onSelectTable(table, ev) {
        const isNewTableOrder = !table.order_count;
        await super.onSelectTable(...arguments);

        if (isNewTableOrder && !this.pos.isEditMode) {
            const order = this.pos.get_order();
            if (!order) return;

            let dinersConfirmed = false;
            let count = 0;

            if (this.pos.config.ask_diners_on_table_open) {
                const { confirmed, payload: inputNumber } = await this.popup.add(NumberPopup, {
                    title: _t("Number of Diners (%s)", table.name),
                    startingValue: table.seats || 1,
                    isInputSelected: true,
                });

                if (confirmed && inputNumber) {
                    count = parseInt(inputNumber, 10);
                    if (count > 0) {
                        if (typeof order.setCustomerCount === "function") {
                            order.setCustomerCount(count);
                        } else if (typeof order.set_customer_count === "function") {
                            order.set_customer_count(count);
                        } else {
                            order.customerCount = count;
                        }
                        dinersConfirmed = true;
                    }
                }
            }

            const ormService = this.pos.env.services.orm || this.orm;
            const popupService = this.pos.env.services.popup || this.popup;

            // Check if Automatic Appetizer is enabled and configured
            let isAutoAppetizerEnabled = Boolean(this.pos.config.enable_auto_appetizer);
            let appetizerConfigIds = this.pos.config.appetizer_product_ids || [];

            // If not found in memory pos.config, check backend pos.config
            if (!isAutoAppetizerEnabled && ormService) {
                try {
                    const [cfg] = await ormService.read(
                        "pos.config",
                        [this.pos.config.id],
                        ["enable_auto_appetizer", "appetizer_product_ids"]
                    );
                    if (cfg) {
                        isAutoAppetizerEnabled = Boolean(cfg.enable_auto_appetizer);
                        appetizerConfigIds = cfg.appetizer_product_ids || [];
                        this.pos.config.enable_auto_appetizer = isAutoAppetizerEnabled;
                        this.pos.config.appetizer_product_ids = appetizerConfigIds;
                    }
                } catch (err) {
                    console.warn("[AutoAppetizer] Failed to read pos.config from ORM:", err);
                }
            }

            console.log("[AutoAppetizer] Trigger state:", {
                isAutoAppetizerEnabled,
                appetizerConfigIds,
                dinersConfirmed,
                askDiners: this.pos.config.ask_diners_on_table_open,
            });

            const shouldTriggerAppetizer = isAutoAppetizerEnabled && (!this.pos.config.ask_diners_on_table_open || dinersConfirmed);

            if (shouldTriggerAppetizer) {
                const rawIds = Array.isArray(appetizerConfigIds)
                    ? appetizerConfigIds.map(item => (typeof item === "object" && item ? item.id : item))
                    : [];

                let appetizerProducts = rawIds
                    .map(id => this.pos.db.get_product_by_id(id) || (this.pos.db.product_by_id && this.pos.db.product_by_id[id]))
                    .filter(Boolean);

                // If not found in POS DB, fetch from ORM as fallback
                if (!appetizerProducts.length && rawIds.length && ormService) {
                    try {
                        const readProducts = await ormService.read(
                            "product.product",
                            rawIds,
                            ["id", "display_name", "lst_price", "pos_categ_ids", "taxes_id", "uom_id"]
                        );
                        if (readProducts && readProducts.length) {
                            appetizerProducts = readProducts;
                            for (const p of readProducts) {
                                if (!this.pos.db.product_by_id[p.id]) {
                                    this.pos.db.product_by_id[p.id] = p;
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("[AutoAppetizer] Error reading products from ORM:", e);
                    }
                }

                console.log("[AutoAppetizer] Available products for popup:", appetizerProducts);

                if (appetizerProducts.length && popupService) {
                    const { confirmed, payload } = await popupService.add(AppetizerSelectionPopup, {
                        title: _t("Select Appetizer"),
                        tableName: table.name,
                        products: appetizerProducts,
                        dinersCount: count || table.seats || 1,
                    });

                    if (confirmed && payload?.product) {
                        const qty = payload.quantity || 1;
                        const productToAdd = this.pos.db.get_product_by_id(payload.product.id) || payload.product;
                        order.add_product(productToAdd, {
                            quantity: qty,
                        });
                        order.send_to_kitchen = true;
                        if (typeof this.pos.sendOrderInPreparationUpdateLastChange === "function") {
                            await this.pos.sendOrderInPreparationUpdateLastChange(order);
                        }
                    }
                } else {
                    console.warn("[AutoAppetizer] No products resolved for IDs:", rawIds);
                }
            }
        }
    },
});