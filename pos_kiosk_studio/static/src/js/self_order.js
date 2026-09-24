/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { SelfOrder } from "@pos_self_order/app/self_order_service";
import {
    loadKioskSettings,
    saveTheme,
    saveElementStyles,
    clearThemeOnly,
} from "@pos_kiosk_studio/js/kiosk_storage";

const DRAG_THRESHOLD = 6;

patch(SelfOrder.prototype, {
    async setup(env, services) {
        await super.setup(env, services);
        this.defaultStudio = {
            primaryColor: "#875A7B",
            secondaryColor: "#6c757d",
            backgroundColor: "#f8f9fa",
            navbarColor: "#ffffff",
            navbarTextColor: "#000000",
            cartBgColor: "#ffffff",
            cartTextColor: "#000000",
            productBgColor: "#ffffff",
            productTextColor: "#000000",
            productRadius: "0px",
            backgroundImage: null,
            fontFamily: "inherit",
            showCategories: true,
            categoryPosition: "top",
            showCategoryHeaders: true,
            catImgSize: 80,
            imgSize: 100,
            imgPadding: 0,
        };

        const { theme, elementStyles } = await loadKioskSettings();
        this.studio = theme ? { ...this.defaultStudio, ...theme } : { ...this.defaultStudio };
        this.elementStyles = elementStyles || {};
        this.availableFonts = this._buildFontList();

        this.isEditMode = false;
        this.isDragMode = false;
        this.selectedDomElement = null;
        this.hoveredElement = null;
        this._studioSidebar = null;

        this._boundClickHandler = this._onElementClick.bind(this);
        this._boundHoverHandler = this._onElementHover.bind(this);
        this._boundDragPointerDown = this._onDragPointerDown.bind(this);
        this._boundDragPointerMove = this._onDragPointerMove.bind(this);
        this._boundDragPointerUp = this._onDragPointerUp.bind(this);
        this._boundReadonlyBlock = this._onReadonlyBlock.bind(this);

        this._drag = {
            active: false,
            el: null,
            startX: 0,
            startY: 0,
            originTx: 0,
            originTy: 0,
            moved: false,
            pointerId: null,
        };

        this._tooltip = document.createElement("div");
        this._tooltip.className = "kiosk-tooltip";
        this._tooltip.style.cssText =
            "position:fixed;pointer-events:none;display:none;z-index:99999;" +
            "background:#333;color:#fff;padding:2px 6px;border-radius:3px;" +
            "font-size:11px;white-space:nowrap;";
        document.body.appendChild(this._tooltip);
        document.body.classList.add("kiosk-theme");

        this._applyTheme();
        this._startStyleObserver();

        if (typeof requestAnimationFrame !== "undefined") {
            requestAnimationFrame(() => this._applySavedElementStyles());
        } else {
            setTimeout(() => this._applySavedElementStyles(), 300);
        }
    },

    _buildFontList() {
        const iconKeywords = ["awesome", "icon", "material", "glyphicon", "symbol", "webdings", "wingdings", "odoo_ui"];
        const genericFamilies = new Set(["inherit", "initial", "unset", "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui"]);
        const computed = getComputedStyle(document.documentElement);

        const parseStack = (stack) =>
            (stack || "")
                .split(",")
                .map(f => f.replace(/['"]/g, "").trim())
                .filter(f =>
                    f &&
                    !f.startsWith("-") &&
                    !genericFamilies.has(f) &&
                    !iconKeywords.some(k => f.toLowerCase().includes(k))
                );

        const allNames = new Set();
        for (const prop of ["--body-font-family", "--font-sans-serif", "--font", "--font-monospace"]) {
            parseStack(computed.getPropertyValue(prop)).forEach(n => allNames.add(n));
        }

        return [
            { label: "Default (Odoo)", value: "inherit" },
            ...[...allNames].map(name => ({ label: name, value: `'${name}', sans-serif` })),
        ];
    },

    _startStyleObserver() {
        if (this._styleObserver || typeof MutationObserver === "undefined") return;
        this._styleObserver = new MutationObserver(() => {
            if (this._drag.active) return;
            this._applySavedElementStyles();
        });
        this._styleObserver.observe(document.body, { childList: true, subtree: true });
    },

    _applyTheme() {
        const root = document.documentElement;
        const s = this.studio;

        root.style.setProperty("--kiosk-primary", s.primaryColor);
        root.style.setProperty("--kiosk-secondary", s.secondaryColor);
        root.style.setProperty("--kiosk-background", s.backgroundColor);
        root.style.setProperty("--kiosk-navbar-bg", s.navbarColor);
        root.style.setProperty("--kiosk-navbar-text", s.navbarTextColor);
        root.style.setProperty("--kiosk-cart-bg", s.cartBgColor);
        root.style.setProperty("--kiosk-cart-text", s.cartTextColor);
        root.style.setProperty("--kiosk-product-bg", s.productBgColor);
        root.style.setProperty("--kiosk-product-text", s.productTextColor);
        root.style.setProperty("--kiosk-product-radius", s.productRadius);
        root.style.setProperty("--kiosk-bg-image", s.backgroundImage ? `url(${s.backgroundImage})` : "none");

        const catImgSize = parseInt(s.catImgSize, 10) || 80;
        root.style.setProperty("--kiosk-cat-img-size", catImgSize + "px");
        root.style.setProperty("--kiosk-sidebar-width", (catImgSize + 24) + "px");
        root.style.setProperty("--kiosk-img-size", (parseInt(s.imgSize, 10) || 100) + "%");
        root.style.setProperty("--kiosk-img-padding", (parseInt(s.imgPadding, 10) || 0) + "%");

        if (!s.fontFamily || s.fontFamily === "inherit") {
            root.style.removeProperty("--kiosk-font-family");
        } else {
            root.style.setProperty("--kiosk-font-family", s.fontFamily);
        }

        document.body.classList.toggle("kiosk-hide-categories", s.showCategories === false);
        document.body.classList.toggle("kiosk-hide-category-headers", s.showCategoryHeaders === false);

        this.setCategoryPosition(s.categoryPosition || "top");
    },

    async updateTheme(data) {
        Object.assign(this.studio, data);
        await saveTheme(this.studio);
        this._applyTheme();
        this._applySavedElementStyles();
    },

    async resetTheme() {
        await clearThemeOnly();
        this.studio = { ...this.defaultStudio };
        this._applyTheme();
        this._applySavedElementStyles();
    },

    enableEditMode() {
        if (this.isEditMode) return;
        if (this.isDragMode) this.disableDragMode();
        this.isEditMode = true;
        document.body.classList.add("kiosk-edit-mode");
        document.addEventListener("click", this._boundClickHandler, true);
        document.addEventListener("mousemove", this._boundHoverHandler, true);
        document.addEventListener("touchstart", this._boundReadonlyBlock, true);
        document.addEventListener("focusin", this._boundReadonlyBlock, true);
        document.addEventListener("keydown", this._boundReadonlyBlock, true);
    },

    disableEditMode() {
        this.isEditMode = false;
        document.body.classList.remove("kiosk-edit-mode");
        document.removeEventListener("click", this._boundClickHandler, true);
        document.removeEventListener("mousemove", this._boundHoverHandler, true);
        document.removeEventListener("touchstart", this._boundReadonlyBlock, true);
        document.removeEventListener("focusin", this._boundReadonlyBlock, true);
        document.removeEventListener("keydown", this._boundReadonlyBlock, true);
        if (this.selectedDomElement) {
            this.selectedDomElement.classList.remove("kiosk-selected");
        }
        if (this.hoveredElement) {
            this.hoveredElement.classList.remove("kiosk-hover");
            this.hoveredElement = null;
        }
        if (this._tooltip) this._tooltip.style.display = "none";
    },

    enableDragMode() {
        if (this.isDragMode) return;
        if (this.isEditMode) this.disableEditMode();
        this.isDragMode = true;
        document.body.classList.add("kiosk-drag-mode");
        document.addEventListener("pointerdown", this._boundDragPointerDown, true);
        document.addEventListener("click", this._boundReadonlyBlock, true);
        document.addEventListener("touchstart", this._boundReadonlyBlock, true);
        document.addEventListener("focusin", this._boundReadonlyBlock, true);
        document.addEventListener("keydown", this._boundReadonlyBlock, true);
    },

    disableDragMode() {
        if (!this.isDragMode) return;
        this.isDragMode = false;
        document.body.classList.remove("kiosk-drag-mode");
        document.removeEventListener("pointerdown", this._boundDragPointerDown, true);
        document.removeEventListener("pointermove", this._boundDragPointerMove, true);
        document.removeEventListener("pointerup", this._boundDragPointerUp, true);
        document.removeEventListener("click", this._boundReadonlyBlock, true);
        document.removeEventListener("touchstart", this._boundReadonlyBlock, true);
        document.removeEventListener("focusin", this._boundReadonlyBlock, true);
        document.removeEventListener("keydown", this._boundReadonlyBlock, true);
        this._cancelDrag();
    },

    _cancelDrag() {
        if (this._drag.el) {
            this._drag.el.classList.remove("kiosk-dragging");
        }
        this._drag = {
            active: false,
            el: null,
            startX: 0,
            startY: 0,
            originTx: 0,
            originTy: 0,
            moved: false,
            pointerId: null,
        };
        if (this._tooltip) this._tooltip.style.display = "none";
    },

    // Handles both matrix(a,b,c,d,tx,ty) and translate(tx,ty) / translate(tx) formats
    _getCurrentTranslate(el) {
        // First try to read from the saved elementStyles for this element
        // so we always start from the last known good position
        const selector = this.generateSelector(el);
        const saved = this.elementStyles[selector]?.transform;
        if (saved) {
            // Parse translate(tx, ty) format
            const tMatch = saved.match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/);
            if (tMatch) return { tx: parseFloat(tMatch[1]), ty: parseFloat(tMatch[2]) };
            // Parse matrix format
            const mMatch = saved.match(/matrix\(([^)]+)\)/);
            if (mMatch) {
                const v = mMatch[1].split(",").map(Number);
                return { tx: v[4] || 0, ty: v[5] || 0 };
            }
        }

        // Fallback: read from computed style
        const matrix = window.getComputedStyle(el).transform;
        if (!matrix || matrix === "none") return { tx: 0, ty: 0 };
        const parts = matrix.match(/matrix\(([^)]+)\)/);
        if (!parts) return { tx: 0, ty: 0 };
        const v = parts[1].split(",").map(Number);
        return { tx: v[4] || 0, ty: v[5] || 0 };
    },

    _onReadonlyBlock(ev) {
        if (ev.target.closest?.(".kiosk-studio-sidebar")) return;
        if (ev.type === "pointerdown") return;
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation?.();
    },

    _onDragPointerDown(ev) {
        if (!this.isDragMode) return;
        if (ev.target.closest?.(".kiosk-studio-sidebar")) return;
        if (ev.button !== undefined && ev.button !== 0) return;

        ev.preventDefault();
        ev.stopPropagation();

        const el = ev.target;
        const { tx, ty } = this._getCurrentTranslate(el);

        this._drag = {
            active: true,
            el,
            startX: ev.clientX,
            startY: ev.clientY,
            originTx: tx,
            originTy: ty,
            moved: false,
            pointerId: ev.pointerId,
        };

        // Disconnect observer so it cannot fight the drag
        this._styleObserver?.disconnect();
        this._styleObserver = null;

        document.addEventListener("pointermove", this._boundDragPointerMove, { capture: true, passive: false });
        document.addEventListener("pointerup", this._boundDragPointerUp, { capture: true, passive: false });
    },

    _onDragPointerMove(ev) {
        if (!this._drag.active) return;

        ev.preventDefault();
        ev.stopPropagation();

        const dx = ev.clientX - this._drag.startX;
        const dy = ev.clientY - this._drag.startY;

        if (!this._drag.moved) {
            if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
            this._drag.moved = true;
            this._drag.el.classList.add("kiosk-dragging");
        }

        const newTx = this._drag.originTx + dx;
        const newTy = this._drag.originTy + dy;

        // Use setProperty with important so it always wins
        this._drag.el.style.setProperty(
            "transform",
            `translate(${newTx}px, ${newTy}px)`,
            "important"
        );

        if (this._tooltip) {
            this._tooltip.innerText = `${Math.round(newTx)}px, ${Math.round(newTy)}px`;
            this._tooltip.style.display = "block";
            this._tooltip.style.left = (ev.clientX + 14) + "px";
            this._tooltip.style.top = (ev.clientY + 14) + "px";
        }
    },

    _onDragPointerUp(ev) {
        ev.preventDefault();
        ev.stopPropagation();

        document.removeEventListener("pointermove", this._boundDragPointerMove, { capture: true, passive: false });
        document.removeEventListener("pointerup", this._boundDragPointerUp, { capture: true, passive: false });

        if (!this._drag.active) return;

        const { el, moved } = this._drag;

        if (moved) {
            // Read directly from the inline style we just set — guaranteed translate() format
            const inlineTransform = el.style.getPropertyValue("transform");
            const tMatch = inlineTransform.match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/);
            const tx = tMatch ? parseFloat(tMatch[1]) : 0;
            const ty = tMatch ? parseFloat(tMatch[2]) : 0;

            el.classList.remove("kiosk-dragging");

            const selector = this.generateSelector(el);
            if (selector) {
                this.elementStyles[selector] = {
                    ...this.elementStyles[selector] || {},
                    transform: `translate(${tx}px, ${ty}px)`,
                };
                saveElementStyles(this.elementStyles);
            }

            this._studioSidebar?.onElementMoved(el);
        }
        this._cancelDrag();
        // Restart observer now that drag is finished
        this._startStyleObserver();
    },

    setCategoryPosition(position) {
        const POSITIONS = ["top", "left", "right", "bottom"];
        const pos = POSITIONS.includes(position) ? position : "top";
        const body = document.body;
        POSITIONS.forEach(p => body.classList.remove(`kiosk-cat-${p}`));
        body.classList.add(`kiosk-cat-${pos}`);

        const root = document.querySelector(".o_self_order") || document.body;
        const navbar =
            root.querySelector(".navbar-container") ||
            root.querySelector(".self_order_navbar") ||
            root.querySelector("nav.navbar");

        if (!navbar) return;

        root.style.removeProperty("display");
        root.style.removeProperty("flex-direction");
        navbar.style.removeProperty("order");
        navbar.style.removeProperty("width");

        if (pos === "top" || pos === "bottom") {
            root.style.display = "flex";
            root.style.flexDirection = "column";
            navbar.style.order = pos === "top" ? "-1" : "999";
            navbar.style.width = "100%";
        }
    },

    resetElementPosition(el) {
        if (!el) return;
        const selector = this.generateSelector(el);
        ["transform", "position", "z-index"].forEach(prop => el.style.removeProperty(prop));
        if (this.elementStyles[selector]) {
            ["transform", "position", "z-index"].forEach(prop => delete this.elementStyles[selector][prop]);
            if (!Object.keys(this.elementStyles[selector]).length) {
                delete this.elementStyles[selector];
            }
        }
        saveElementStyles(this.elementStyles);
    },

    resetAllPositions() {
        const POSITION_PROPS = ["transform", "position", "z-index"];
        [...Object.keys(this.elementStyles)].forEach(selector => {
            let els;
            try { els = document.querySelectorAll(selector); } catch { return; }
            els.forEach(el => POSITION_PROPS.forEach(prop => el.style.removeProperty(prop)));
            POSITION_PROPS.forEach(prop => delete this.elementStyles[selector][prop]);
            if (!Object.keys(this.elementStyles[selector]).length) {
                delete this.elementStyles[selector];
            }
        });
        saveElementStyles(this.elementStyles);
    },

    persistElementStyles() {
        saveElementStyles(this.elementStyles);
    },

    removeEmojiFromElement(el) {
        if (!el) return;
        el.querySelector(".kiosk-emoji")?.remove();
        const selector = this.generateSelector(el);
        if (this.elementStyles[selector]) {
            delete this.elementStyles[selector].emoji;
            if (!Object.keys(this.elementStyles[selector]).length) {
                delete this.elementStyles[selector];
            }
        }
        saveElementStyles(this.elementStyles);
    },

    addEmojiToElement(el, emoji) {
        if (!el || !emoji) return;

        el.querySelector(".kiosk-emoji")?.remove();

        const span = document.createElement("span");
        span.className = "kiosk-emoji";
        span.textContent = emoji;
        span.style.cssText = "margin-left:6px;font-size:1.2em;";
        el.appendChild(span);

        const selector = this.generateSelector(el);
        this.elementStyles[selector] = {
            ...this.elementStyles[selector] || {},
            emoji,
        };
        saveElementStyles(this.elementStyles);
    },

    _onElementClick(ev) {
        if (!this.isEditMode) return;
        if (ev.target.closest?.(".kiosk-studio-sidebar")) return;

        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation?.();

        const el = ev.target;
        if (this.selectedDomElement) {
            this.selectedDomElement.classList.remove("kiosk-selected");
        }
        this.selectedDomElement = el;
        el.classList.add("kiosk-selected");

        this._studioSidebar?.syncElementStyles(el);
    },

    _onElementHover(ev) {
        if (!this.isEditMode) return;
        const el = ev.target;
        if (this.hoveredElement === el) return;
        if (this.hoveredElement) {
            this.hoveredElement.classList.remove("kiosk-hover");
        }
        this.hoveredElement = el;
        if (el !== this.selectedDomElement) {
            el.classList.add("kiosk-hover");
        }
        if (this._tooltip) {
            this._tooltip.innerText = el.tagName.toLowerCase();
            this._tooltip.style.display = "block";
            this._tooltip.style.left = (ev.clientX + 12) + "px";
            this._tooltip.style.top = (ev.clientY + 12) + "px";
        }
    },

    applyElementStyles(el, styles) {
        if (!el) return;
        const selector = this.generateSelector(el);
        if (!selector) return;
        const normalized = {};
        Object.entries(styles).forEach(([key, value]) => {
            if (!value) return;
            const cssKey = key.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
            el.style.setProperty(cssKey, value, "important");
            normalized[cssKey] = value;
        });
        this.elementStyles[selector] = { ...this.elementStyles[selector], ...normalized };
        saveElementStyles(this.elementStyles);
        this._applySavedElementStyles();
    },

    resetElementStyles(el) {
        if (!el) return;
        const selector = this.generateSelector(el);
        ["background-color", "color", "border-radius", "font-family",
            "transform", "position", "z-index"].forEach(prop => el.style.removeProperty(prop));
        el.querySelector(".kiosk-emoji")?.remove();
        delete this.elementStyles[selector];
        saveElementStyles(this.elementStyles);
    },

    resetElementStyleProp(el, prop) {
        if (!el) return;
        const selector = this.generateSelector(el);
        el.style.removeProperty(prop);
        if (this.elementStyles[selector]) {
            delete this.elementStyles[selector][prop];
        }
        saveElementStyles(this.elementStyles);
    },

    _applySavedElementStyles() {
        // Never run while a drag is active
        if (this._drag?.active) return;
        const LAYOUT_PROTECTED = new Set([
            "grid-column", "grid-row", "grid-template-columns",
            "grid-template-rows", "min-width",
        ]);
        Object.entries(this.elementStyles).forEach(([selector, styles]) => {
            if (!selector) return;
            let els;
            try { els = document.querySelectorAll(selector); } catch { return; }
            els.forEach(el => {
                Object.entries(styles).forEach(([k, v]) => {
                    if (k === "emoji") {
                        if (!el.querySelector(".kiosk-emoji")) {
                            const span = document.createElement("span");
                            span.className = "kiosk-emoji";
                            span.textContent = v;
                            span.style.cssText = "margin-left:6px;font-size:1.2em;";
                            el.appendChild(span);
                        }
                        return;
                    }
                    if (!LAYOUT_PROTECTED.has(k)) {
                        el.style.setProperty(k, v, "important");
                    }
                });
            });
        });
    },

    generateSelector(el) {
        if (!el) return "";
        if (el === document.body) return "body";
        if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) return "#" + el.id;
        const path = [];
        let current = el;
        while (current && current.nodeType === 1) {
            let segment = current.tagName.toLowerCase();
            if (current.classList?.length) {
                const stableClasses = [...current.classList]
                    .filter(c =>
                        c !== "kiosk-selected" &&
                        c !== "kiosk-hover" &&
                        c !== "kiosk-dragging" &&
                        !c.startsWith("o_")
                    )
                    .slice(0, 2);
                if (stableClasses.length) {
                    segment += "." + stableClasses
                        .map(c => c.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1"))
                        .join(".");
                }
            }
            const parent = current.parentElement;
            if (parent) {
                segment += ":nth-child(" + ([...parent.children].indexOf(current) + 1) + ")";
            }
            path.unshift(segment);
            if (current === document.body) break;
            current = parent;
        }
        return path.join(" > ") || "body";
    },
});