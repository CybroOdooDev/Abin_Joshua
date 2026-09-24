/** @odoo-module **/

import { Component, useState, onMounted } from "@odoo/owl";
import { useSelfOrder } from "@pos_self_order/app/self_order_service";
import {
    loadKioskSettings,
    saveImageToServer,
    deleteImageFromServer,
} from "@pos_kiosk_studio/js/kiosk_storage";

const EMOJI_GROUPS = [
    { label: "Smileys", emojis: ["😀","😂","😍","🥰","😎","🤩","😋","🤗","😊","🙂","😉","🥳"] },
    { label: "Food", emojis: ["🍕","🍔","🌮","🍣","🍜","🍩","🧁","🍦","☕","🧃","🍷","🥂"] },
    { label: "Symbols", emojis: ["⭐","❤️","✅","🔥","💯","🎉","🏆","💎","🆕","🔔","💬","📌"] },
    { label: "Gestures", emojis: ["👍","👏","🙌","✌️","🤝","💪","🫶","🤌","👌","🫰","🤙","☝️"] },
];

export class StudioSidebar extends Component {
    static props = {
        closeStudio: Function,
    };

    setup() {
        this.selfOrder = useSelfOrder();
        const s = this.selfOrder.studio;

        this.state = useState({
            primaryColor: s.primaryColor,
            secondaryColor: s.secondaryColor,
            backgroundColor: s.backgroundColor,
            backgroundImage: null,
            backgroundImageName: null,

            navbarColor: s.navbarColor,
            navbarTextColor: s.navbarTextColor,

            cartBgColor: s.cartBgColor,
            cartTextColor: s.cartTextColor,

            productBgColor: s.productBgColor,
            productTextColor: s.productTextColor,
            productRadius: s.productRadius,

            fontFamily: s.fontFamily,

            elementBgColor: "#ffffff",
            elementTextColor: "#000000",
            elementRadius: "0px",
            elementFontFamily: "inherit",
            elementEmoji: "",
            showEmojiPicker: false,

            showCategories: s.showCategories ?? true,
            categoryPosition: s.categoryPosition || "top",
            showCategoryHeaders: s.showCategoryHeaders ?? true,

            catImgSize: s.catImgSize ?? 80,
            imgSize: s.imgSize ?? 100,
            imgPadding: s.imgPadding ?? 0,

            isDragMode: false,
            lastMovedElement: null,
        });

        this.emojiGroups = EMOJI_GROUPS;
        this.selfOrder._studioSidebar = this;
        onMounted(() => this._loadBackgroundImage());
    }

    async _loadBackgroundImage() {
        const { bgFilename, bgImage } = await loadKioskSettings();
        if (bgImage) {
            this.state.backgroundImage = bgImage;
            this.state.backgroundImageName = bgFilename || "background.jpg";
        }
    }

    toggleDragMode() {
        if (this.state.isDragMode) {
            this.state.isDragMode = false;
            this.state.lastMovedElement = null;
            this.selfOrder.disableDragMode();
        } else {
            this.state.isDragMode = true;
            this.selfOrder.enableDragMode();
        }
    }

    exitDragMode() {
        if (this.state.isDragMode) this.toggleDragMode();
    }

    onElementMoved(el) {
        this.state.lastMovedElement = el;
    }

    resetLastPosition() {
        if (!this.state.lastMovedElement) return;
        this.selfOrder.resetElementPosition(this.state.lastMovedElement);
        this.state.lastMovedElement = null;
    }

    resetAllPositions() {
        this.selfOrder.resetAllPositions();
        this.state.lastMovedElement = null;
    }

    toggleCategories(ev) {
        this.state.showCategories = ev.target.checked;
        document.body.classList.toggle("kiosk-hide-categories", !this.state.showCategories);
    }

    setCategoryPosition(ev) {
        const pos = ev.target.value;
        this.state.categoryPosition = pos;
        this.selfOrder.setCategoryPosition(pos);
    }

    onCatImgSizeInput(ev) {
        const size = parseInt(ev.target.value, 10) || 80;
        this.state.catImgSize = size;
        const root = document.documentElement;
        root.style.setProperty("--kiosk-cat-img-size", size + "px");
        root.style.setProperty("--kiosk-sidebar-width", (size + 24) + "px");
        this.selfOrder.setCategoryPosition(this.state.categoryPosition);
    }

    onImgSizeInput(ev) {
        const size = parseInt(ev.target.value, 10) || 100;
        this.state.imgSize = size;
        document.documentElement.style.setProperty("--kiosk-img-size", size + "%");
    }

    onImgPaddingInput(ev) {
        const padding = parseInt(ev.target.value, 10) || 0;
        this.state.imgPadding = padding;
        document.documentElement.style.setProperty("--kiosk-img-padding", padding + "%");
    }

    get availableFonts() {
        return this.selfOrder.availableFonts;
    }

    get isSidebarPosition() {
        return this.state.categoryPosition === "left" || this.state.categoryPosition === "right";
    }

    get selectedElement() {
        return this.selfOrder.selectedDomElement;
    }

    syncElementStyles(el) {
        if (!el) return;
        let computed;
        try { computed = window.getComputedStyle(el); } catch { return; }

        const get = (prop) =>
            el.style.getPropertyValue(prop) ||
            (computed ? computed.getPropertyValue(prop) : "") || "";

        this.state.elementBgColor = this._rgbToHex(get("background-color")) || "#ffffff";
        this.state.elementTextColor = this._rgbToHex(get("color")) || "#000000";
        this.state.elementRadius = get("border-radius") || "0px";
        this.state.elementFontFamily = get("font-family") || "inherit";
        this.state.showEmojiPicker = false;

        const selector = this.selfOrder.generateSelector(el);
        this.state.elementEmoji = this.selfOrder.elementStyles[selector]?.emoji || "";
    }

    _rgbToHex(rgb) {
        if (!rgb) return null;
        rgb = rgb.trim();
        if (rgb === "transparent" || rgb === "") return null;
        if (rgb.startsWith("#")) return rgb.toLowerCase();
        const match = rgb.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
        if (!match) return null;
        return "#" + [match[1], match[2], match[3]]
            .map((v) => parseInt(v, 10).toString(16).padStart(2, "0"))
            .join("");
    }

    applyElementStyles() {
        const el = this.selectedElement;
        if (!el) return;
        this.selfOrder.applyElementStyles(el, {
            backgroundColor: this.state.elementBgColor,
            color: this.state.elementTextColor,
            borderRadius: this.state.elementRadius,
            fontFamily: this.state.elementFontFamily,
        });
    }

    resetElementStyles() {
        const el = this.selectedElement;
        if (!el) return;
        this.selfOrder.resetElementStyles(el);
        this.state.elementEmoji = "";
        this.syncElementStyles(el);
    }

    resetBg() { this._resetProp("background-color"); }
    resetText() { this._resetProp("color"); }
    resetFont() { this._resetProp("font-family"); }
    resetRadius() { this._resetProp("border-radius"); }

    _resetProp(prop) {
        const el = this.selectedElement;
        if (!el) return;
        this.selfOrder.resetElementStyleProp(el, prop);
        this.syncElementStyles(el);
    }

    toggleEmojiPicker() {
        this.state.showEmojiPicker = !this.state.showEmojiPicker;
    }

    selectEmoji(emoji) {
        this.state.elementEmoji = emoji;
        this.state.showEmojiPicker = false;
        const el = this.selectedElement;
        if (el) this.selfOrder.addEmojiToElement(el, emoji);
    }

    onEmojiClick(ev) {
        const emoji = ev.currentTarget.dataset.emoji;
        if (emoji) this.selectEmoji(emoji);
    }

    removeEmoji() {
        const el = this.selectedElement;
        if (!el) return;
        this.selfOrder.removeEmojiFromElement(el);
        this.state.elementEmoji = "";
    }

    onImageChange(ev) {
        const file = ev.target?.files?.[0];
        if (!file) return;
        this.state.backgroundImageName = file.name;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target.result;
            this.state.backgroundImage = base64;
            await saveImageToServer(base64, file.name);
        };
        reader.onerror = () => console.error("[KioskStudio] Failed to read image file");
        reader.readAsDataURL(file);
    }

    async applyTheme() {
        await this.selfOrder.updateTheme({
            primaryColor: this.state.primaryColor,
            secondaryColor: this.state.secondaryColor,
            backgroundColor: this.state.backgroundColor,
            backgroundImage: this.state.backgroundImage,
            backgroundImageName: this.state.backgroundImageName,
            navbarColor: this.state.navbarColor,
            navbarTextColor: this.state.navbarTextColor,
            cartBgColor: this.state.cartBgColor,
            cartTextColor: this.state.cartTextColor,
            productBgColor: this.state.productBgColor,
            productTextColor: this.state.productTextColor,
            productRadius: this.state.productRadius,
            fontFamily: this.state.fontFamily,
            showCategories: this.state.showCategories,
            categoryPosition: this.state.categoryPosition,
            showCategoryHeaders: this.state.showCategoryHeaders,
            catImgSize: this.state.catImgSize,
            imgSize: this.state.imgSize,
            imgPadding: this.state.imgPadding,
        });
    }

    async resetBackgroundImage() {
        this.state.backgroundImage = null;
        this.state.backgroundImageName = null;
        await deleteImageFromServer();
        await this.selfOrder.updateTheme({ backgroundImage: null });
    }

    async resetTheme() {
        await this.selfOrder.resetTheme();
        const d = this.selfOrder.defaultStudio;
        Object.assign(this.state, {
            primaryColor: d.primaryColor,
            secondaryColor: d.secondaryColor,
            backgroundColor: d.backgroundColor,
            navbarColor: d.navbarColor,
            navbarTextColor: d.navbarTextColor,
            cartBgColor: d.cartBgColor,
            cartTextColor: d.cartTextColor,
            productBgColor: d.productBgColor,
            productTextColor: d.productTextColor,
            productRadius: d.productRadius,
            fontFamily: d.fontFamily,
            showCategories: d.showCategories,
            categoryPosition: d.categoryPosition,
            showCategoryHeaders: d.showCategoryHeaders,
            catImgSize: d.catImgSize,
            imgSize: d.imgSize,
            imgPadding: d.imgPadding,
            backgroundImage: null,
            backgroundImageName: null,
        });
    }

    closeSidebar = () => {
        if (this.state.isDragMode) {
            this.selfOrder.disableDragMode();
            this.state.isDragMode = false;
        }
        if (this.selfOrder.selectedDomElement) {
            this.selfOrder.selectedDomElement.classList.remove("kiosk-selected");
            this.selfOrder.selectedDomElement = null;
        }
        this.selfOrder.disableEditMode();
        this.props.closeStudio();
    };
}

StudioSidebar.template = "pos_kiosk_studio.StudioSidebar";