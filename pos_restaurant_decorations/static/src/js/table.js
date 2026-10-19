/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Table } from "@pos_restaurant/app/floor_screen/table";
import { getPresetById, getPresetUrl } from "@pos_restaurant_decorations/js/decor_presets";

patch(Table.prototype, {
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

    get hasDecorImage() {
        return Boolean(this.decorImageUrl);
    },

    get isLabelVisible() {
        return this.props.table.show_label !== false;
    },

    get isSeatsVisible() {
        const table = this.props.table;
        if (table.show_seats === false) return false;
        if (table.is_decoration && (!table.seats || table.seats === 0)) return false;
        return true;
    },

    get tableDecorClass() {
        let extra = "";
        if (this.hasDecorImage) {
            extra += " has-decor-image";
        }
        if (this.props.table.is_decoration) {
            extra += " is-decor-scenery";
        }
        return extra;
    },

    get style() {
        let style = super.style;
        if (this.hasDecorImage) {
            // Replace solid background with transparent / subtle backdrop so SVG is fully visible
            if (!this.isOccupied()) {
                style = style.replace(/background:\s*[^;]+;/, "background: transparent;");
                style = style.replace(/border:\s*[^;]+;/, "border: 1.5px dashed rgba(255,255,255,0.4);");
            } else {
                style = style.replace(/background:\s*[^;]+;/, "background: rgba(53, 211, 116, 0.25);");
            }
        }
        return style;
    },
});
