/** @odoo-module **/

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { _t } from "@web/core/l10n/translation";
import { useState, useRef } from "@odoo/owl";
import {
    DECOR_PRESETS,
    getPresetUrl,
    getPresetById,
} from "@pos_restaurant_decorations/js/decor_presets";

export class TableCustomizationPopup extends AbstractAwaitablePopup {
    static template = "pos_restaurant_decorations.TableCustomizationPopup";
    static defaultProps = {
        title: _t("Customize Table / Decor Item"),
        confirmText: _t("Apply Changes"),
        cancelText: _t("Cancel"),
    };

    setup() {
        super.setup();
        const table = this.props.table || {};
        this.fileInputRef = useRef("custom-file-input");

        let currentImagePreview = null;
        if (table.custom_image) {
            currentImagePreview = `data:image/png;base64,${table.custom_image}`;
        } else if (table.decor_preset_id) {
            const preset = getPresetById(table.decor_preset_id);
            if (preset) currentImagePreview = getPresetUrl(preset.file);
        } else if (table.image_url) {
            currentImagePreview = table.image_url;
        }

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
            showPresetPicker: false,
        });
    }

    get presets() {
        return DECOR_PRESETS;
    }

    getPresetImgUrl(preset) {
        return getPresetUrl(preset.file);
    }

    selectPreset(preset) {
        this.state.decor_preset_id = preset.id;
        this.state.image_url = getPresetUrl(preset.file);
        this.state.custom_image = null;
        this.state.imagePreview = getPresetUrl(preset.file);
        this.state.showPresetPicker = false;
        if (preset.is_decoration) {
            this.state.is_decoration = true;
            this.state.seats = 0;
            this.state.show_seats = false;
        }
    }

    removeIcon() {
        this.state.decor_preset_id = null;
        this.state.image_url = null;
        this.state.custom_image = null;
        this.state.imagePreview = null;
        if (this.fileInputRef.el) {
            this.fileInputRef.el.value = "";
        }
    }

    async onFileSelected(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target.result;
            const base64 = result.split(",")[1];
            this.state.custom_image = base64;
            this.state.imagePreview = result;
            this.state.decor_preset_id = null;
            this.state.image_url = null;
        };
        reader.readAsDataURL(file);
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
        };
    }
}
