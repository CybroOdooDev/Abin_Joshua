/** @odoo-module **/

import { toPng } from "@point_of_sale/app/utils/html-to-image";
import { loadAllImages } from "@point_of_sale/utils";

/**
 * Applies high-contrast thermal printing styles and typography overrides to an element.
 * Forces solid black (#000000) text, bold font weights, and clean borders.
 * @param {HTMLElement} el
 */
export function applyThermalReceiptStyles(el) {
    if (!el) return;

    el.classList.add("pos-thermal-receipt");
    el.style.width = "330px";
    el.style.maxWidth = "330px";
    el.style.minWidth = "330px";
    el.style.boxSizing = "border-box";
    el.style.margin = "0 auto";
    el.style.padding = "10px 14px";
    el.style.backgroundColor = "#ffffff";
    el.style.color = "#000000";
    el.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
    el.style.fontSize = "15px";
    el.style.lineHeight = "1.35";

    // Inject high-contrast thermal overrides directly inside the container
    let styleTag = el.querySelector("style.thermal-print-override");
    if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.className = "thermal-print-override";
        styleTag.textContent = `
            .pos-thermal-receipt, .pos-thermal-receipt * {
                color: #000000 !important;
                border-color: #000000 !important;
            }
            .pos-thermal-receipt .pos-receipt-contact {
                font-size: 13px !important;
                font-weight: 700 !important;
                text-align: center !important;
                line-height: 1.3 !important;
            }
            .pos-thermal-receipt .orderline {
                padding: 4px 0 !important;
                border-bottom: 1px dashed #000000 !important;
            }
            .pos-thermal-receipt .orderline .product-name {
                font-size: 16px !important;
                font-weight: 800 !important;
                line-height: 1.2 !important;
            }
            .pos-thermal-receipt .orderline .product-price,
            .pos-thermal-receipt .orderline .price {
                font-size: 16px !important;
                font-weight: 800 !important;
            }
            .pos-thermal-receipt .orderline .info-list,
            .pos-thermal-receipt .orderline .price-per-unit {
                font-size: 13px !important;
                font-weight: 700 !important;
            }
            .pos-thermal-receipt .orderline .price-per-unit em,
            .pos-thermal-receipt .orderline .price-per-unit .qty {
                font-size: 14px !important;
                font-weight: 800 !important;
                font-style: normal !important;
            }
            .pos-thermal-receipt .pos-receipt-amount {
                font-size: 19px !important;
                font-weight: 900 !important;
            }
            .pos-thermal-receipt .paymentlines,
            .pos-thermal-receipt .payment-info {
                font-size: 14px !important;
                font-weight: 700 !important;
            }
            .pos-thermal-receipt .pos-receipt-taxes {
                font-size: 12px !important;
                font-weight: 700 !important;
            }
            .pos-thermal-receipt .pos-receipt-taxes span {
                font-weight: 700 !important;
            }
            .pos-thermal-receipt .pos-receipt-customer,
            .pos-thermal-receipt .pos-receipt-invoice-box {
                font-size: 13px !important;
                font-weight: 700 !important;
            }
            .pos-thermal-receipt .customer-note,
            .pos-thermal-receipt .internal-note {
                font-size: 13px !important;
                font-weight: 800 !important;
                background-color: #f0f0f0 !important;
                border-left: 3px solid #000000 !important;
                padding: 4px 8px !important;
            }
            .pos-thermal-receipt hr {
                border-top: 2px dashed #000000 !important;
                opacity: 1 !important;
            }
        `;
        el.prepend(styleTag);
    }
}

/**
 * Mounts the receipt node in an isolated off-screen wrapper, applies thermal contrast styles,
 * waits for all nested images (logo, QR) to load, and captures as lossless PNG at 2x pixel ratio.
 * This mirrors the exact off-screen capture pattern proven by kitchen display printing.
 *
 * @param {HTMLElement} elementToCapture
 * @returns {Promise<string|null>} Base64 image data without data-uri prefix
 */
export async function captureThermalReceipt(elementToCapture) {
    if (!elementToCapture) return null;

    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-2000px";
    wrapper.style.top = "0";
    wrapper.style.width = "330px";
    wrapper.style.backgroundColor = "#ffffff";
    wrapper.style.pointerEvents = "none";

    applyThermalReceiptStyles(elementToCapture);
    wrapper.appendChild(elementToCapture);
    document.body.appendChild(wrapper);

    try {
        try {
            await loadAllImages(elementToCapture);
        } catch (_) {}

        const dataUrl = await toPng(elementToCapture, {
            skipFonts: true,
            backgroundColor: "#ffffff",
            pixelRatio: 2,
        });

        if (dataUrl && dataUrl !== "data:," && dataUrl.length >= 100) {
            return dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
        }
    } catch (err) {
        console.error("captureThermalReceipt failed:", err);
    } finally {
        wrapper.remove();
    }
    return null;
}
