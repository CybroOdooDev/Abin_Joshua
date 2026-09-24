/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Table } from "@pos_restaurant/app/floor_screen/table";
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