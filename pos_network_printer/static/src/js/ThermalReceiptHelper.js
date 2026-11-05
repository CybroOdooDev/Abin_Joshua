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
    el.style.width = "288px";
    el.style.maxWidth = "288px";
    el.style.minWidth = "288px";
    el.style.boxSizing = "border-box";
    el.style.margin = "0 auto";
    el.style.padding = "6px 8px";
    el.style.backgroundColor = "#ffffff";
    el.style.color = "#000000";
    el.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
    el.style.fontSize = "14px";
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
                box-sizing: border-box !important;
            }
            .pos-thermal-receipt table,
            .pos-thermal-receipt table tr,
            .pos-thermal-receipt table td,
            .pos-thermal-receipt table th,
            .pos-thermal-receipt ul,
            .pos-thermal-receipt ol {
                border: none !important;
                outline: none !important;
                box-shadow: none !important;
                list-style: none !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            .pos-thermal-receipt .kitchen-course-header,
            .pos-thermal-receipt .kitchen-course-header * {
                color: #000000 !important;
                background-color: #ffffff !important;
                border-color: #000000 !important;
            }
            .pos-thermal-receipt .pos-receipt-contact {
                font-size: 12px !important;
                font-weight: 700 !important;
                text-align: center !important;
                line-height: 1.3 !important;
            }
            .pos-thermal-receipt .orderline {
                padding: 4px 0 !important;
                margin: 0 !important;
                border-top: none !important;
                border-left: none !important;
                border-right: none !important;
                border-bottom: 1px dashed #000000 !important;
                outline: none !important;
                box-shadow: none !important;
                background-color: transparent !important;
            }
            .pos-thermal-receipt .orderline.comboParent,
            .pos-thermal-receipt .orderline.border-start,
            .pos-thermal-receipt .orderline.ms-4 {
                border-top: none !important;
                border-right: none !important;
                border-bottom: none !important;
                border-left: 2px solid #000000 !important;
                margin-left: 10px !important;
                padding-left: 6px !important;
            }
            .pos-thermal-receipt .orderline .product-name {
                font-size: 15px !important;
                font-weight: 800 !important;
                line-height: 1.2 !important;
            }
            .pos-thermal-receipt .orderline .product-price,
            .pos-thermal-receipt .orderline .price {
                font-size: 15px !important;
                font-weight: 800 !important;
            }
            .pos-thermal-receipt .orderline .info-list,
            .pos-thermal-receipt .orderline .price-per-unit {
                font-size: 12px !important;
                font-weight: 700 !important;
            }
            .pos-thermal-receipt .orderline .price-per-unit em,
            .pos-thermal-receipt .orderline .price-per-unit .qty {
                font-size: 13px !important;
                font-weight: 800 !important;
                font-style: normal !important;
            }
            .pos-thermal-receipt .pos-receipt-amount {
                font-size: 18px !important;
                font-weight: 900 !important;
            }
            .pos-thermal-receipt .paymentlines,
            .pos-thermal-receipt .payment-info {
                font-size: 13px !important;
                font-weight: 700 !important;
            }
            .pos-thermal-receipt .pos-receipt-taxes {
                font-size: 11px !important;
                font-weight: 700 !important;
            }
            .pos-thermal-receipt .pos-receipt-taxes span {
                font-weight: 700 !important;
            }
            .pos-thermal-receipt .pos-receipt-customer,
            .pos-thermal-receipt .pos-receipt-invoice-box {
                font-size: 12px !important;
                font-weight: 700 !important;
            }
            .pos-thermal-receipt .customer-note,
            .pos-thermal-receipt .internal-note {
                font-size: 12px !important;
                font-weight: 800 !important;
                background-color: transparent !important;
                border-left: 2px solid #000000 !important;
                padding: 3px 6px !important;
            }
            .pos-thermal-receipt hr {
                border-top: 1px dashed #000000 !important;
                opacity: 1 !important;
                margin: 6px 0 !important;
            }
            .pos-thermal-receipt img.pos-receipt-qrcode,
            .pos-thermal-receipt img#posqrcode,
            .pos-thermal-receipt .pos-receipt-qrcode img {
                image-rendering: pixelated !important;
                image-rendering: crisp-edges !important;
            }
        `;
        el.prepend(styleTag);
    }
}

/**
 * Binarizes a data URL image to pure solid monochrome (#000000 and #ffffff).
 * Completely eliminates Floyd-Steinberg dithering artifacts and faint blurry text.
 * @param {string} dataUrl
 * @param {number} threshold
 * @returns {Promise<string>}
 */
function binarizeDataUrl(dataUrl, threshold) {
    var thresh = typeof threshold === "number" ? threshold : 205;
    return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
            try {
                var canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                var ctx = canvas.getContext("2d");
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);

                var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                var data = imgData.data;
                var len = data.length;
                for (var i = 0; i < len; i += 4) {
                    if (data[i + 3] < 128) {
                        data[i] = 255;
                        data[i + 1] = 255;
                        data[i + 2] = 255;
                        data[i + 3] = 255;
                    } else {
                        var lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                        var val = lum < thresh ? 0 : 255;
                        data[i] = val;
                        data[i + 1] = val;
                        data[i + 2] = val;
                        data[i + 3] = 255;
                    }
                }
                ctx.putImageData(imgData, 0, 0);
                resolve(canvas.toDataURL("image/png"));
            } catch (e) {
                console.warn("Binarization fallback to raw dataUrl:", e);
                resolve(dataUrl);
            }
        };
        img.onerror = function () {
            resolve(dataUrl);
        };
        img.src = dataUrl;
    });
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
    wrapper.style.width = "288px";
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
            const binarizedUrl = await binarizeDataUrl(dataUrl, 205);
            return binarizedUrl.replace(/^data:image\/[a-z]+;base64,/, "");
        }
    } catch (err) {
        console.error("captureThermalReceipt failed:", err);
    } finally {
        wrapper.remove();
    }
    return null;
}
