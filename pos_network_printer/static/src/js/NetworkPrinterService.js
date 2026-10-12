/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";

/**
 * Renders a DOM element (the POS receipt) to a high-resolution base64 PNG image.
 * Ensures custom fonts, alignments, logos, barcodes, and styles are preserved.
 */
export async function renderReceiptToImageBase64(receiptElement) {
    if (!receiptElement) {
        throw new Error("No receipt DOM element provided for rasterization.");
    }

    if (typeof window.html2canvas !== "function") {
        throw new Error("html2canvas library is not loaded.");
    }

    // Temporarily ensure background is white and visible for accurate capture
    const originalBackground = receiptElement.style.backgroundColor;
    receiptElement.style.backgroundColor = "#ffffff";

    try {
        const canvas = await window.html2canvas(receiptElement, {
            scale: 2, // High resolution for thermal clarity
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#ffffff",
            logging: false,
        });
        return canvas.toDataURL("image/png");
    } finally {
        receiptElement.style.backgroundColor = originalBackground;
    }
}

/**
 * Dispatches the rendered receipt image to Odoo backend to print via local network socket.
 */
export async function dispatchNetworkPrint(orm, orderId, imageBase64, printerId = null) {
    return await orm.call(
        "pos.order",
        "print_network_receipt_from_ui",
        [orderId, imageBase64, printerId]
    );
}
