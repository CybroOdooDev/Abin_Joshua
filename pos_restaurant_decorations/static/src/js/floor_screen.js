/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { FloorScreen } from "@pos_restaurant/app/floor_screen/floor_screen";
import { DecorPresetPopup } from "@pos_restaurant_decorations/js/decor_preset_popup";
import { TableCustomizationPopup } from "@pos_restaurant_decorations/js/table_customization_popup";

patch(FloorScreen.prototype, {
    setup() {
        super.setup();
        this.pos.floorPlanStyle = "default";
        try {
            localStorage.setItem("floorPlanStyle", "default");
        } catch (_) {}
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
        this.autoFitFloorMap();
    },

    autoFitFloorMap() {
        if (!this.map || !this.map.el || !this.floorMapRef || !this.floorMapRef.el) return;
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

        // Auto-scale so that the customized floor plan layout fits and stays intact on screen
        if (maxRight > cWidth || maxBottom > cHeight) {
            const scaleX = cWidth / maxRight;
            const scaleY = cHeight / maxBottom;
            const fitScale = Math.min(scaleX, scaleY);
            const finalScale = Math.max(0.4, Math.min(1, fitScale));
            this.setScale(finalScale);
        } else {
            this.setScale(1);
        }
    },

    async onSaveTable(table) {
        if (!table || !table.id) return;
        table.active = true;
        if (this.pos.tables_by_id[table.id]) {
            this.pos.tables_by_id[table.id].active = true;
        }
        await this._save(table);
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
        const existingTable = this.activeTables || [];
        let posH = 40;
        let posV = 40;

        // Position new item relative to current scroll viewport so it appears in front of user
        if (this.floorMapRef && this.floorMapRef.el) {
            const scrollLeft = this.floorMapRef.el.scrollLeft || 0;
            const scrollTop = this.floorMapRef.el.scrollTop || 0;
            posH = Math.max(30, scrollLeft + 50);
            posV = Math.max(30, scrollTop + 50);
        }

        // Avoid dropping exactly on top of an existing table
        let attempts = 0;
        while (
            attempts < 30 &&
            existingTable.some(
                (t) =>
                    Math.abs((t.position_h || 0) - posH) < 40 &&
                    Math.abs((t.position_v || 0) - posV) < 40
            )
        ) {
            posH += 50;
            posV += 30;
            attempts++;
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
            rotation: typeof payload.rotation === "number" ? payload.rotation : 0,
            z_index: typeof payload.z_index === "number" ? payload.z_index : 10,
            floor_id: [this.activeFloor.id, ""],
            floor: this.activeFloor,
            active: true,
        };

        await this._save(newTable);
        this.activeTables.push(newTable);
        this.activeFloor.table_ids.push(newTable.id);
        this.pos.tables_by_id[newTable.id] = newTable;
        this.state.selectedTableIds = [newTable.id];
        return newTable;
    },

    async rotateLeft() {
        if (!this.selectedTables || this.selectedTables.length === 0) return;
        for (const table of this.selectedTables) {
            const current = typeof table.rotation === "number" ? table.rotation : 0;
            table.rotation = (current - 90 + 360) % 360;
            await this._save(table);
        }
        this.render();
    },

    async rotateRight() {
        if (!this.selectedTables || this.selectedTables.length === 0) return;
        for (const table of this.selectedTables) {
            const current = typeof table.rotation === "number" ? table.rotation : 0;
            table.rotation = (current + 90) % 360;
            await this._save(table);
        }
        this.render();
    },

    async bringToFront() {
        if (!this.selectedTables || this.selectedTables.length === 0) return;
        const allTables = this.activeTables || [];
        let maxZ = 10;
        for (const t of allTables) {
            const z = typeof t.z_index === "number" ? t.z_index : 10;
            if (z > maxZ) maxZ = z;
        }
        for (const table of this.selectedTables) {
            maxZ += 1;
            table.z_index = maxZ;
            await this._save(table);
        }
        this.render();
    },

    async sendToBack() {
        if (!this.selectedTables || this.selectedTables.length === 0) return;
        const allTables = this.activeTables || [];
        let minZ = 10;
        for (const t of allTables) {
            const z = typeof t.z_index === "number" ? t.z_index : 10;
            if (z < minZ) minZ = z;
        }
        if (minZ <= 1) {
            const shift = 2 - minZ;
            for (const t of allTables) {
                if (!this.selectedTables.includes(t)) {
                    t.z_index = (typeof t.z_index === "number" ? t.z_index : 10) + shift;
                    await this._save(t);
                }
            }
            minZ = 2;
        }
        for (const table of this.selectedTables) {
            minZ = Math.max(1, minZ - 1);
            table.z_index = minZ;
            await this._save(table);
        }
        this.render();
    },

    async _save(table) {
        table.active = true;
        const tableCopy = {
            floor_id: table.floor ? table.floor.id : (Array.isArray(table.floor_id) ? table.floor_id[0] : table.floor_id),
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
            rotation: typeof table.rotation === "number" ? table.rotation : 0,
            z_index: typeof table.z_index === "number" ? table.z_index : 10,
            active: true,
        };

        if (table.id) {
            await this.orm.write("restaurant.table", [table.id], tableCopy);
        } else {
            const tableId = await this.orm.create("restaurant.table", [tableCopy]);
            table.id = tableId[0];
            table.active = true;
            this.pos.tables_by_id[table.id] = table;
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
