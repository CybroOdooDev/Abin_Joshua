/** @odoo-module **/

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { _t } from "@web/core/l10n/translation";
import { useState, useRef } from "@odoo/owl";
import {
    DECOR_CATEGORIES,
    DECOR_PRESETS,
    getPresetUrl,
    getPresetById,
} from "@pos_restaurant_decorations/js/decor_presets";

export class DecorPresetPopup extends AbstractAwaitablePopup {
    static template = "pos_restaurant_decorations.DecorPresetPopup";
    static defaultProps = {
        title: _t("Add Decoration or Preset Table"),
        confirmText: _t("Add to Floor"),
        cancelText: _t("Cancel"),
    };

    setup() {
        super.setup();
        this.fileInputRef = useRef("file-input-ref");
        this.state = useState({
            activeTab: "presets", // 'presets' | 'custom'
            selectedCategory: "all",
            searchWord: "",
            selectedPresetId: DECOR_PRESETS[0] ? DECOR_PRESETS[0].id : null,
            customImageBase64: null,
            customImagePreview: null,
            customName: "",
            customSeats: 0,
            customIsDecoration: true,
        });
    }

    get categories() {
        return DECOR_CATEGORIES;
    }

    get filteredPresets() {
        const cat = this.state.selectedCategory;
        const search = this.state.searchWord.trim().toLowerCase();

        return DECOR_PRESETS.filter((item) => {
            const matchesCat = cat === "all" || item.category === cat;
            const matchesSearch = !search || item.name.toLowerCase().includes(search);
            return matchesCat && matchesSearch;
        });
    }

    getPresetImgUrl(preset) {
        return getPresetUrl(preset.file);
    }

    selectCategory(catId) {
        this.state.selectedCategory = catId;
    }

    selectPreset(presetId) {
        this.state.selectedPresetId = presetId;
    }

    onPresetDoubleClick(presetId) {
        this.state.selectedPresetId = presetId;
        this.confirm();
    }

    async onFileSelected(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target.result;
            const base64 = result.split(",")[1];
            this.state.customImageBase64 = base64;
            this.state.customImagePreview = result;
            if (!this.state.customName) {
                const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
                this.state.customName = nameWithoutExt.charAt(0).toUpperCase() + nameWithoutExt.slice(1);
            }
        };
        reader.readAsDataURL(file);
    }

    clearCustomImage() {
        this.state.customImageBase64 = null;
        this.state.customImagePreview = null;
        if (this.fileInputRef.el) {
            this.fileInputRef.el.value = "";
        }
    }

    getPayload() {
        if (this.state.activeTab === "custom") {
            if (!this.state.customImageBase64) {
                return null;
            }
            return {
                isCustom: true,
                custom_image: this.state.customImageBase64,
                table_type: this.state.customIsDecoration ? "decoration" : "table",
                is_decoration: this.state.customIsDecoration,
                decor_preset_id: null,
                name: this.state.customName || _t("Custom Decor"),
                width: 70,
                height: 70,
                shape: "square",
                seats: this.state.customSeats,
                show_label: true,
                show_seats: !this.state.customIsDecoration,
            };
        }

        const preset = getPresetById(this.state.selectedPresetId);
        if (!preset) return null;

        return {
            isCustom: false,
            preset,
            decor_preset_id: preset.id,
            table_type: preset.table_type,
            is_decoration: preset.is_decoration,
            name: preset.name,
            width: preset.width,
            height: preset.height,
            shape: preset.shape,
            seats: preset.seats,
            image_url: getPresetUrl(preset.file),
            show_label: !preset.is_decoration,
            show_seats: !preset.is_decoration,
        };
    }
}
