/** @odoo-module **/

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { _t } from "@web/core/l10n/translation";
import { useState } from "@odoo/owl";
import { getPresetUrl, getPresetById } from "@pos_restaurant_decorations/js/decor_presets";

export class TableCustomizationPopup extends AbstractAwaitablePopup {
    static template = "pos_restaurant_decorations.TableCustomizationPopup";
    static defaultProps = {
        title: _t("Customize Item"),
        confirmText: _t("Apply Changes"),
        cancelText: _t("Cancel"),
    };

    setup() {
        super.setup();
        const table = this.props.table || {};

        let currentImagePreview = null;
        let preset = null;
        if (table.custom_image) {
            currentImagePreview = `data:image/png;base64,${table.custom_image}`;
        } else if (table.decor_preset_id) {
            preset = getPresetById(table.decor_preset_id);
            if (preset) currentImagePreview = getPresetUrl(preset.file);
        } else if (table.image_url) {
            currentImagePreview = table.image_url;
        }

        this.preset = preset;
        this.state = useState({
            name: table.name || "",
            seats: table.seats || 1,
            is_decoration: Boolean(table.is_decoration),
            show_label: table.show_label !== false,
            show_seats: table.show_seats !== false,
            decor_preset_id: table.decor_preset_id || null,
            image_url: table.image_url || null,
            custom_image: table.custom_image || null,
            imagePreview: currentImagePreview,
            rotation: typeof table.rotation === "number" ? table.rotation : 0,
            z_index: typeof table.z_index === "number" ? table.z_index : 10,
        });
    }

    get isDiningTable() {
        if (this.state.is_decoration) return false;
        if (!this.preset) return true;
        return this.preset.category === "table";
    }

    get modalTitle() {
        if (this.isDiningTable) {
            return _t("Customize Dining Table");
        }
        return _t("Customize Decoration Item");
    }

    get itemCategoryBadge() {
        if (this.preset) {
            const catMap = {
                table: _t("Dining Table"),
                chair: _t("Chair"),
                bar: _t("Bar Item"),
                flowerpot: _t("Plant / Flower"),
                barrel: _t("Barrel"),
                decoration: _t("Decoration"),
            };
            return catMap[this.preset.category] || _t("Decor Preset");
        }
        if (this.state.custom_image) {
            return _t("Custom Graphic");
        }
        return _t("Standard Table");
    }

    get nameLabelText() {
        return this.isDiningTable ? _t("Table Name / Number") : _t("Item Name / Label");
    }

    get showNameToggleText() {
        return this.isDiningTable
            ? _t("Show Table Name on floor map")
            : _t("Show Item Name on floor map");
    }

    onToggleIsDecoration() {
        this.state.is_decoration = !this.state.is_decoration;
        if (this.state.is_decoration) {
            this.state.seats = 0;
            this.state.show_seats = false;
        } else {
            if (!this.state.seats || this.state.seats === 0) {
                this.state.seats = this.preset && this.preset.seats ? this.preset.seats : 4;
            }
            this.state.show_seats = true;
        }
    }

    getPayload() {
        return {
            name: this.state.name,
            seats: this.state.is_decoration ? 0 : this.state.seats,
            is_decoration: this.state.is_decoration,
            show_label: this.state.show_label,
            show_seats: this.state.show_seats,
            decor_preset_id: this.state.decor_preset_id,
            image_url: this.state.image_url,
            custom_image: this.state.custom_image,
            rotation: this.state.rotation || 0,
            z_index: this.state.z_index || 10,
        };
    }
}
