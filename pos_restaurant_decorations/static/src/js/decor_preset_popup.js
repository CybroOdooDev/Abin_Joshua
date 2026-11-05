/** @odoo-module **/

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { ConfirmPopup } from "@point_of_sale/app/utils/confirm_popup/confirm_popup";
import { _t } from "@web/core/l10n/translation";
import { sprintf } from "@web/core/utils/strings";
import { useState, useRef } from "@odoo/owl";
import {
    DECOR_CATEGORIES,
    DECOR_PRESETS,
    getPresetUrl,
    getPresetById,
} from "@pos_restaurant_decorations/js/decor_presets";
import {
    fetchAllSavedDecorImages,
    getLocalSavedImages,
    saveDecorImageLocally,
    removeDecorImageLocally,
} from "@pos_restaurant_decorations/js/decor_storage";

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

        // Immediately load any cached local saved images so there is zero UI delay
        const cachedSaved = getLocalSavedImages();

        this.state = useState({
            activeTab: "presets", // 'presets' | 'saved' | 'custom'
            selectedCategory: "all",
            searchWord: "",
            selectedPresetId: DECOR_PRESETS[0] ? DECOR_PRESETS[0].id : null,
            // Saved library state
            selectedSavedImageId: cachedSaved[0] ? cachedSaved[0].id : null,
            savedSearchWord: "",
            savedImages: cachedSaved,
            isLoadingSaved: false,
            // Custom upload state
            customImageBase64: null,
            customImagePreview: null,
            customName: "",
            customSeats: 0,
            customIsDecoration: true,
            saveToLibrary: true,
            autoSavedNotice: false,
        });

        this.loadSavedImages();
    }

    async loadSavedImages() {
        this.state.isLoadingSaved = true;
        try {
            const images = await fetchAllSavedDecorImages(this.orm, this.pos);
            this.state.savedImages = images || [];
            if (!this.state.selectedSavedImageId && this.state.savedImages.length > 0) {
                this.state.selectedSavedImageId = this.state.savedImages[0].id;
            }
        } catch (error) {
            console.error("Failed to load saved decor images:", error);
        } finally {
            this.state.isLoadingSaved = false;
        }
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

    get filteredSavedImages() {
        const search = this.state.savedSearchWord.trim().toLowerCase();
        if (!search) return this.state.savedImages;
        return this.state.savedImages.filter((img) =>
            img.name && img.name.toLowerCase().includes(search)
        );
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

    selectSavedImage(imageId) {
        this.state.selectedSavedImageId = imageId;
    }

    onSavedImageDoubleClick(imageId) {
        this.state.selectedSavedImageId = imageId;
        this.confirm();
    }

    async deleteSavedImage(ev, imageId) {
        if (ev) ev.stopPropagation();
        const img = this.state.savedImages.find((item) => item.id === imageId);
        const name = img ? img.name : _t("this graphic");
        const { confirmed } = await this.popup.add(ConfirmPopup, {
            title: _t("Delete Saved Graphic"),
            body: sprintf(_t("Are you sure you want to remove '%s' from your saved system library?"), name),
        });
        if (!confirmed) return;

        // Remove locally from state and storage
        removeDecorImageLocally(img);
        this.state.savedImages = this.state.savedImages.filter((item) => item.id !== imageId);
        if (this.state.selectedSavedImageId === imageId) {
            this.state.selectedSavedImageId = this.state.savedImages[0] ? this.state.savedImages[0].id : null;
        }

        // Try backend removal if available
        if (typeof imageId === "number") {
            try {
                await this.orm.call(
                    "pos.session",
                    "delete_saved_decor_image",
                    [this.pos.pos_session.id, imageId]
                );
            } catch {
                // Backend method not yet loaded by host server; local storage handles it
            }
        }
    }

    async onFileSelected(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const result = e.target.result;
            const base64 = result.split(",")[1];
            this.state.customImageBase64 = base64;
            this.state.customImagePreview = result;
            if (!this.state.customName) {
                const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
                this.state.customName = nameWithoutExt.charAt(0).toUpperCase() + nameWithoutExt.slice(1);
            }

            // AUTO-SAVE immediately so if the user switches to 'Saved Library' tab, it's ALREADY there!
            if (this.state.saveToLibrary) {
                const newSavedItem = {
                    id: "saved_" + Date.now(),
                    name: this.state.customName,
                    custom_image: base64,
                    is_decoration: this.state.customIsDecoration,
                    seats: this.state.customSeats || 0,
                    table_type: this.state.customIsDecoration ? "decoration" : "table",
                };
                saveDecorImageLocally(newSavedItem);

                // Add to current in-memory saved list
                const withoutDuplicate = this.state.savedImages.filter(
                    (item) => item.name !== newSavedItem.name || item.custom_image !== newSavedItem.custom_image
                );
                this.state.savedImages = [newSavedItem, ...withoutDuplicate];
                this.state.selectedSavedImageId = newSavedItem.id;
                this.state.autoSavedNotice = true;
                setTimeout(() => {
                    this.state.autoSavedNotice = false;
                }, 4000);

                // Background backend save if available
                try {
                    await this.orm.call(
                        "pos.session",
                        "save_decor_image",
                        [
                            this.pos.pos_session.id,
                            newSavedItem.name,
                            base64,
                            newSavedItem.is_decoration,
                            newSavedItem.seats,
                            newSavedItem.table_type,
                        ]
                    );
                } catch {
                    // Ignored if Python method not loaded yet
                }
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

    async onSaveToLibraryOnly() {
        if (!this.state.customImageBase64) return;
        const newSavedItem = {
            id: "saved_" + Date.now(),
            name: this.state.customName || _t("Custom Decor"),
            custom_image: this.state.customImageBase64,
            is_decoration: this.state.customIsDecoration,
            seats: this.state.customSeats || 0,
            table_type: this.state.customIsDecoration ? "decoration" : "table",
        };
        saveDecorImageLocally(newSavedItem);

        const withoutDuplicate = this.state.savedImages.filter(
            (item) => item.name !== newSavedItem.name || item.custom_image !== newSavedItem.custom_image
        );
        this.state.savedImages = [newSavedItem, ...withoutDuplicate];
        this.state.selectedSavedImageId = newSavedItem.id;
        this.state.activeTab = "saved";
        this.clearCustomImage();

        try {
            await this.orm.call(
                "pos.session",
                "save_decor_image",
                [
                    this.pos.pos_session.id,
                    newSavedItem.name,
                    newSavedItem.custom_image,
                    newSavedItem.is_decoration,
                    newSavedItem.seats,
                    newSavedItem.table_type,
                ]
            );
        } catch {
            // Ignored if Python method not loaded yet
        }
    }

    getPayload() {
        if (this.state.activeTab === "saved") {
            const savedItem = this.state.savedImages.find(
                (item) => item.id === this.state.selectedSavedImageId
            );
            if (!savedItem) return null;

            return {
                isCustom: true,
                custom_image: savedItem.custom_image,
                table_type: savedItem.table_type || (savedItem.is_decoration ? "decoration" : "table"),
                is_decoration: savedItem.is_decoration !== undefined ? savedItem.is_decoration : true,
                decor_preset_id: null,
                name: savedItem.name || _t("Custom Decor"),
                width: 70,
                height: 70,
                shape: "square",
                seats: savedItem.seats || 0,
                show_label: true,
                show_seats: !savedItem.is_decoration,
            };
        }

        if (this.state.activeTab === "custom") {
            if (!this.state.customImageBase64) {
                return null;
            }
            const item = {
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
                saveToLibrary: this.state.saveToLibrary,
            };
            if (item.saveToLibrary) {
                saveDecorImageLocally({
                    id: "saved_" + Date.now(),
                    name: item.name,
                    custom_image: item.custom_image,
                    is_decoration: item.is_decoration,
                    seats: item.seats,
                    table_type: item.table_type,
                });
            }
            return item;
        }

        const preset = getPresetById(this.state.selectedPresetId);
        if (!preset) return null;

        const isTable = preset.category === "table";
        const isDecor = preset.is_decoration !== undefined ? preset.is_decoration : !isTable;

        return {
            isCustom: false,
            preset,
            decor_preset_id: preset.id,
            table_type: preset.table_type,
            is_decoration: isDecor,
            name: preset.name,
            width: preset.width,
            height: preset.height,
            shape: preset.shape,
            seats: isDecor ? 0 : (preset.seats || 4),
            image_url: getPresetUrl(preset.file),
            show_label: true,
            show_seats: !isDecor,
        };
    }
}
