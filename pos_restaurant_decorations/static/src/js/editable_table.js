/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { EditableTable } from "@pos_restaurant/app/floor_screen/editable_table";
import { getPresetById, getPresetUrl } from "@pos_restaurant_decorations/js/decor_presets";

patch(EditableTable.prototype, {
    get decorImageUrl() {
        const table = this.props.table;
        if (!table) return null;

        if (table.custom_image) {
            return `data:image/png;base64,${table.custom_image}`;
        }
        if (table.decor_preset_id) {
            const preset = getPresetById(table.decor_preset_id);
            if (preset) {
                return getPresetUrl(preset.file);
            }
        }
        if (table.image_url) {
            return table.image_url;
        }
        return null;
    },

    get isLabelVisible() {
        return this.props.table.show_label !== false;
    },

    getFloorScale() {
        if (!this.root || !this.root.el) return 1;
        const mapEl = this.root.el.closest(".floor-map > div") || this.root.el.parentElement;
        if (!mapEl) return 1;
        const scaleVal = parseFloat(mapEl.style.getPropertyValue("--scale"));
        return !isNaN(scaleVal) && scaleVal > 0 ? scaleVal : 1;
    },

    onMoveStart() {
        super.onMoveStart(...arguments);
        const onMouseUp = () => {
            document.removeEventListener("mouseup", onMouseUp, true);
            document.removeEventListener("touchend", onMouseUp, true);
            if (this.props.onSaveTable && this.props.selectedTables) {
                for (const t of this.props.selectedTables) {
                    this.props.onSaveTable(t);
                }
            }
        };
        document.addEventListener("mouseup", onMouseUp, { once: true, capture: true });
        document.addEventListener("touchend", onMouseUp, { once: true, capture: true });
    },

    onMove({ dx, dy }) {
        if (this.pos.floorPlanStyle == "kanban") {
            return;
        }
        const scale = this.getFloorScale();
        const el = this.root.el;
        const limitEl = this.props.limit.el;
        let minX = 0;
        let maxX = 5000;
        let minY = 0;
        let maxY = 5000;
        if (el && limitEl && el.offsetParent) {
            const { width, height } = el.getBoundingClientRect();
            const limitRect = limitEl.getBoundingClientRect();
            const offsetParentRect = el.offsetParent.getBoundingClientRect();
            minX = Math.max(0, (limitRect.left - offsetParentRect.left) / scale);
            maxX = Math.max(minX + 800, (limitRect.left - offsetParentRect.left + limitRect.width - width) / scale);
            minY = Math.max(0, (limitRect.top - offsetParentRect.top) / scale);
            maxY = Math.max(minY + 800, (limitRect.top - offsetParentRect.top + limitRect.height - height) / scale);
        }

        for (const [index, table] of Object.entries(this.selectedTablesCopy || {})) {
            const position_h = table.position_h;
            const position_v = table.position_v;
            const target = this.props.selectedTables[index];
            if (target) {
                target.position_h = Math.max(0, Math.min(position_h + dx / scale, maxX));
                target.position_v = Math.max(0, Math.min(position_v + dy / scale, maxY));
            }
        }

        this._setElementStyle();
    },

    onResizeHandleMove(handle, { dx, dy }) {
        const scale = this.getFloorScale();
        const res = super.onResizeHandleMove(handle, { dx: dx / scale, dy: dy / scale });
        if (this.props.onSaveTable && this.props.table) {
            this.props.onSaveTable(this.props.table);
        }
        return res;
    },

    _setElementStyle() {
        super._setElementStyle(...arguments);
        if (this.decorImageUrl && this.root && this.root.el) {
            // Keep background subtle so vector SVG is visible while moving/resizing
            this.root.el.style.background = "rgba(59, 130, 246, 0.15)";
            this.root.el.style.border = "2px dashed #3b82f6";
        }
    },
});
