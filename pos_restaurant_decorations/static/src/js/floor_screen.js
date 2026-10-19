/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { FloorScreen } from "@pos_restaurant/app/floor_screen/floor_screen";
import { DecorPresetPopup } from "@pos_restaurant_decorations/js/decor_preset_popup";
import { TableCustomizationPopup } from "@pos_restaurant_decorations/js/table_customization_popup";

patch(FloorScreen.prototype, {
    setup() {
        super.setup();
        this._onWindowResize = () => {
            this.autoFitFloorMap();
        };
        window.addEventListener("resize", this._onWindowResize);
    },

    onMounted() {
        super.onMounted();
        this.autoFitFloorMap();
    },

    onWillUnmount() {
        super.onWillUnmount();
        window.removeEventListener("resize", this._onWindowResize);
    },

    selectFloor(floor) {
        super.selectFloor(floor);
        setTimeout(() => this.autoFitFloorMap(), 50);
    },

    autoFitFloorMap() {
        if (!this.floorMapRef || !this.floorMapRef.el || !this.map || !this.map.el) return;
        const container = this.floorMapRef.el;
        const cWidth = container.clientWidth;
        const cHeight = container.clientHeight;
        if (!cWidth || !cHeight) return;

        const tables = this.activeTables || [];
        if (tables.length === 0) {
            this.setScale(1);
            return;
        }

        let maxRight = 0;
        let maxBottom = 0;
        for (const t of tables) {
            const right = (t.position_h || 0) + (t.width || 70);
            const bottom = (t.position_v || 0) + (t.height || 70);
            if (right > maxRight) maxRight = right;
            if (bottom > maxBottom) maxBottom = bottom;
        }

        maxRight += 40;
        maxBottom += 40;

        // Auto-scale on smaller screens (mobile / tablet) to keep all items visible
        if (maxRight > cWidth || maxBottom > cHeight) {
            const scaleX = cWidth / maxRight;
            const scaleY = cHeight / maxBottom;
            const fitScale = Math.min(scaleX, scaleY);
            const finalScale = Math.max(0.35, Math.min(1, fitScale));
            this.setScale(finalScale);
        } else {
            this.setScale(1);
        }
    },

    async addDecor() {
        const { confirmed, payload } = await this.popup.add(DecorPresetPopup);
        if (!confirmed || !payload) return;

        await this.createDecorTable(payload);
    },

    async customizeTable() {
        if (this.selectedTables.length !== 1) return;
        const table = this.selectedTables[0];
        const { confirmed, payload } = await this.popup.add(TableCustomizationPopup, { table });
        if (!confirmed || !payload) return;

        Object.assign(table, payload);
        await this._save(table);
    },

    async createDecorTable(payload) {
        const existingTable = this.activeTables;
        let posV = 20;
        let posH = 20;

        if (existingTable && existingTable.length > 0) {
            const last = existingTable[existingTable.length - 1];
            posH = ((last.position_h || 20) + (payload.width || 70) + 15) % Math.max(300, (window.innerWidth - 150));
            posV = last.position_v || 20;
            if (posH < 30) {
                posH = 20;
                posV = ((last.position_v || 20) + (payload.height || 70) + 15) % Math.max(300, (window.innerHeight - 180));
            }
        }

        const newTable = {
            name: payload.name || this._getNewTableName(),
            position_v: posV,
            position_h: posH,
            width: payload.width || 70,
            height: payload.height || 70,
            shape: payload.shape || "square",
            seats: payload.seats || (payload.is_decoration ? 0 : 2),
            color: payload.is_decoration ? "rgba(0,0,0,0)" : "#35D374",
            table_type: payload.table_type || "decoration",
            is_decoration: Boolean(payload.is_decoration),
            decor_preset_id: payload.decor_preset_id || false,
            image_url: payload.image_url || false,
            custom_image: payload.custom_image || false,
            show_label: payload.show_label !== false,
            show_seats: payload.show_seats !== false,
            floor_id: [this.activeFloor.id, ""],
            floor: this.activeFloor,
        };

        await this._save(newTable);
        this.activeTables.push(newTable);
        this.activeFloor.table_ids.push(newTable.id);
        this.state.selectedTableIds = [newTable.id];
        return newTable;
    },

    async _save(table) {
        const tableCopy = {
            floor_id: table.floor.id,
            color: table.color,
            height: table.height,
            name: table.name,
            position_h: table.position_h,
            position_v: table.position_v,
            seats: table.seats,
            shape: table.shape,
            width: table.width,
            table_type: table.table_type || "table",
            is_decoration: Boolean(table.is_decoration),
            decor_preset_id: table.decor_preset_id || false,
            image_url: table.image_url || false,
            custom_image: table.custom_image || false,
            show_label: table.show_label !== false,
            show_seats: table.show_seats !== false,
        };

        if (table.id) {
            await this.orm.write("restaurant.table", [table.id], tableCopy);
        } else {
            const tableId = await this.orm.create("restaurant.table", [tableCopy]);
            table.id = tableId[0];
            this.pos.tables_by_id[tableId] = table;
        }
    },

    async onSelectTable(table, ev) {
        // Pure scenery decoration: prevent triggering orders, bills, or diner popups
        if (!this.pos.isEditMode && table.is_decoration && (!table.seats || table.seats === 0)) {
            if (ev) ev.stopPropagation();
            return;
        }
        return await super.onSelectTable(...arguments);
    },

    async changeShape(form) {
        if (!this.selectedTables || this.selectedTables.length === 0) return;
        this.selectedTables.forEach(async (selectedTable) => {
            // Guard: never alter shape of decor or image items
            if (
                selectedTable.is_decoration ||
                selectedTable.decor_preset_id ||
                selectedTable.custom_image ||
                selectedTable.image_url
            ) {
                return;
            }
            selectedTable.shape = form;
            await this._save(selectedTable);
        });
    },
});
