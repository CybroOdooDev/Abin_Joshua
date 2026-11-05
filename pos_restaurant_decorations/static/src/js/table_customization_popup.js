/** @odoo-module **/

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { _t } from "@web/core/l10n/translation";
import { useState, useRef } from "@odoo/owl";
import { getPresetUrl, getPresetById } from "@pos_restaurant_decorations/js/decor_presets";
import {
    fetchAllSavedDecorImages,
    getLocalSavedImages,
    saveDecorImageLocally,
} from "@pos_restaurant_decorations/js/decor_storage";

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
        this.fileInputRef = useRef("custom-file-input");
        const cached = getLocalSavedImages();

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
            showSavedPicker: false,
            savedImages: cached,
            isLoadingSaved: false,
            savedToLibrarySuccess: false,
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

    async toggleSavedPicker() {
        this.state.showSavedPicker = !this.state.showSavedPicker;
        if (this.state.showSavedPicker) {
            this.state.isLoadingSaved = true;
            try {
                const images = await fetchAllSavedDecorImages(this.orm, this.pos);
                this.state.savedImages = images || [];
            } catch (err) {
                console.error("Failed to load saved images:", err);
            } finally {
                this.state.isLoadingSaved = false;
            }
        }
    }

    selectSavedImage(item) {
        this.state.custom_image = item.custom_image;
        this.state.imagePreview = `data:image/png;base64,${item.custom_image}`;
        this.state.decor_preset_id = null;
        this.state.image_url = null;
        this.preset = null;
        this.state.showSavedPicker = false;
    }

    onFileSelected(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const result = e.target.result;
            const base64 = result.split(",")[1];
            this.state.custom_image = base64;
            this.state.imagePreview = result;
            this.state.decor_preset_id = null;
            this.state.image_url = null;
            this.preset = null;
            this.state.showSavedPicker = false;

            // Auto-save to library
            const savedItem = {
                id: "saved_" + Date.now(),
                name: this.state.name || file.name.replace(/\.[^/.]+$/, "") || _t("Custom Decor"),
                custom_image: base64,
                is_decoration: this.state.is_decoration,
                seats: this.state.seats || 0,
                table_type: this.state.is_decoration ? "decoration" : "table",
            };
            saveDecorImageLocally(savedItem);
            this.state.savedImages = [savedItem, ...this.state.savedImages];

            try {
                await this.orm.call(
                    "pos.session",
                    "save_decor_image",
                    [
                        this.pos.pos_session.id,
                        savedItem.name,
                        base64,
                        savedItem.is_decoration,
                        savedItem.seats,
                        savedItem.table_type,
                    ]
                );
            } catch {
                // Backend method not yet loaded by host server
            }
        };
        reader.readAsDataURL(file);
    }

    async saveCurrentToLibrary() {
        if (!this.state.custom_image) return;
        const savedItem = {
            id: "saved_" + Date.now(),
            name: this.state.name || _t("Custom Decor"),
            custom_image: this.state.custom_image,
            is_decoration: this.state.is_decoration,
            seats: this.state.seats || 0,
            table_type: this.state.is_decoration ? "decoration" : "table",
        };
        saveDecorImageLocally(savedItem);
        this.state.savedImages = [savedItem, ...this.state.savedImages.filter((s) => s.custom_image !== savedItem.custom_image)];

        this.state.savedToLibrarySuccess = true;
        setTimeout(() => {
            this.state.savedToLibrarySuccess = false;
        }, 3000);

        try {
            await this.orm.call(
                "pos.session",
                "save_decor_image",
                [
                    this.pos.pos_session.id,
                    savedItem.name,
                    this.state.custom_image,
                    this.state.is_decoration,
                    this.state.seats || 0,
                    this.state.is_decoration ? "decoration" : "table",
                ]
            );
        } catch {
            // Backend method not yet loaded by host server
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
