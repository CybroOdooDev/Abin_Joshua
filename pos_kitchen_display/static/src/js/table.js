/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Table } from "@pos_restaurant/app/floor_screen/table";
import { FloorScreen } from "@pos_restaurant/app/floor_screen/floor_screen";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
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

// Patch FloorScreen to automatically prompt for number of diners when opening a new table
patch(FloorScreen.prototype, {
    async onSelectTable(table, ev) {
        const isNewTableOrder = !table.order_count;
        await super.onSelectTable(...arguments);

        if (this.pos.config.ask_diners_on_table_open && isNewTableOrder && !this.pos.isEditMode) {
            const order = this.pos.get_order();
            if (order) {
                const { confirmed, payload: inputNumber } = await this.popup.add(NumberPopup, {
                    title: _t("Number of Diners (%s)", table.name),
                    startingValue: table.seats || 1,
                    isInputSelected: true,
                });

                if (confirmed && inputNumber) {
                    const count = parseInt(inputNumber, 10);
                    if (count > 0) {
                        if (typeof order.setCustomerCount === "function") {
                            order.setCustomerCount(count);
                        } else if (typeof order.set_customer_count === "function") {
                            order.set_customer_count(count);
                        } else {
                            order.customerCount = count;
                        }
                    }
                }
            }
        }
    },
});