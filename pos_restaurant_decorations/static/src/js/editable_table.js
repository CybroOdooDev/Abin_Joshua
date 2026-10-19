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

    _setElementStyle() {
        super._setElementStyle(...arguments);
        if (this.decorImageUrl && this.root && this.root.el) {
            // Keep background subtle so vector SVG is visible while moving/resizing
            this.root.el.style.background = "rgba(59, 130, 246, 0.15)";
            this.root.el.style.border = "2px dashed #3b82f6";
        }
    },
});
