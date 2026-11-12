/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";

class QZPrinterService {
    constructor() {
        this.isConnected = false;
        this.isSecuritySetup = false;
        this._connectPromise = null;
        this.printerPaperWidths = {};
    }

    /**
     * Configures per-printer paper widths from POS printer registry.
     * @param {Object} [settings]
     */
    configure(settings = {}) {
        if (settings.printerPaperWidths && typeof settings.printerPaperWidths === "object") {
            this.printerPaperWidths = {
                ...this.printerPaperWidths,
                ...settings.printerPaperWidths,
            };
        }
    }

    /**
     * Initializes QZ Tray digital certificate and SHA512 signing endpoints.
     */
    async setupSecurity() {
        if (this.isSecuritySetup) {
            return;
        }

        if (typeof window.qz === "undefined") {
            throw new Error(_t("QZ Tray connector library is not loaded in the browser."));
        }

        window.qz.security.setSignatureAlgorithm("SHA512");

        window.qz.security.setCertificatePromise(async () => {
            const response = await fetch("/qz/certificate");
            if (!response.ok) {
                throw new Error(_t("Failed to load QZ certificate from server."));
            }
            return await response.text();
        });

        window.qz.security.setSignaturePromise(async (toSign) => {
            const response = await fetch("/qz/sign", {
                method: "POST",
                headers: {
                    "Content-Type": "text/plain",
                },
                body: toSign,
            });
            if (!response.ok) {
                throw new Error(_t("Failed to sign QZ request on server."));
            }
            return await response.text();
        });

        this.isSecuritySetup = true;
    }

    /**
     * Establishes a WebSocket connection to local QZ Tray (localhost:8182 / localhost:8181).
     */
    async connect() {
        if (typeof window.qz === "undefined") {
            throw new Error(_t("QZ Tray connector library is not loaded."));
        }

        if (window.qz.websocket.isActive()) {
            this.isConnected = true;
            return true;
        }

        if (this._connectPromise) {
            return await this._connectPromise;
        }

        this._connectPromise = (async () => {
            try {
                await this.setupSecurity();
                await window.qz.websocket.connect({
                    retries: 2,
                    delay: 1,
                });
                this.isConnected = true;
                return true;
            } catch (err) {
                this.isConnected = false;
                console.error("QZ Tray connection failed:", err);
                throw new Error(
                    _t("Could not connect to QZ Tray. Please make sure QZ Tray is installed and running on this computer.")
                );
            } finally {
                this._connectPromise = null;
            }
        })();

        return await this._connectPromise;
    }

    /**
     * Finds the target printer. If preferredName is provided, searches for it.
     * Otherwise falls back to the system default printer.
     */
    async resolvePrinter(preferredName = null) {
        await this.connect();

        let printerTargetName = preferredName;
        if (Array.isArray(printerTargetName) && printerTargetName.length > 1) {
            printerTargetName = printerTargetName[1];
        } else if (printerTargetName && typeof printerTargetName === "object" && printerTargetName.name) {
            printerTargetName = printerTargetName.name;
        }

        if (printerTargetName && typeof printerTargetName === "string" && printerTargetName.trim().length > 0) {
            const trimmed = printerTargetName.trim();
            try {
                const found = await window.qz.printers.find(trimmed);
                if (found) {
                    return found;
                }
            } catch (e) {
                console.warn(`Printer "${trimmed}" not found via QZ Tray, falling back to default printer:`, e);
            }
        }

        const defaultPrinter = await window.qz.printers.getDefault();
        if (!defaultPrinter) {
            throw new Error(
                _t("No default printer found in QZ Tray. Please check your OS printer settings or configure a printer name.")
            );
        }
        return defaultPrinter;
    }

    /**
     * Decodes a base64 PNG/data-URI receipt image into an HTMLImageElement.
     */
    loadImageElement(base64) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(_t("Failed to decode receipt image for printing.")));
            img.src = base64.indexOf("data:") === 0 ? base64 : "data:image/png;base64," + base64;
        });
    }

    /**
     * Converts a Uint8Array ESC/POS byte stream to base64 safely in chunks.
     */
    uint8ArrayToBase64(bytes) {
        const chunkSize = 8192;
        const chunks = [];
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            let chunkStr = "";
            for (let j = 0; j < slice.length; j++) {
                chunkStr += String.fromCharCode(slice[j]);
            }
            chunks.push(chunkStr);
        }
        return btoa(chunks.join(""));
    }

    /**
     * Encodes a receipt image into ESC/POS GS v 0 raster slices (512px bands)
     * with a single paper feed and cut at the end, avoiding OS page-height clipping.
     */
    async imageToEscposBase64(imageBase64, paperWidth = "80mm") {
        const img = await this.loadImageElement(imageBase64);
        const targetWidth = paperWidth === "58mm" ? 384 : 576;
        const srcW = img.naturalWidth || img.width || targetWidth;
        const srcH = img.naturalHeight || img.height || 1;
        const targetHeight = Math.max(1, Math.round((srcH * targetWidth) / srcW));

        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const rgba = ctx.getImageData(0, 0, targetWidth, targetHeight).data;

        // Trim excessive trailing whitespace below the footer while keeping a 12px safety margin
        let lastDarkRow = -1;
        for (let y = targetHeight - 1; y >= 0 && lastDarkRow === -1; y--) {
            const rowBase = y * targetWidth * 4;
            for (let x = 0; x < targetWidth; x++) {
                const idx = rowBase + x * 4;
                if (rgba[idx + 3] >= 128) {
                    const lum = 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2];
                    if (lum < 200) {
                        lastDarkRow = y;
                        break;
                    }
                }
            }
        }
        const effectiveHeight = lastDarkRow >= 0
            ? Math.min(targetHeight, lastDarkRow + 12)
            : Math.min(targetHeight, 16);

        const sliceHeight = 512;
        const widthBytes = Math.ceil(targetWidth / 8);
        const bandCount = Math.ceil(effectiveHeight / sliceHeight);
        // 2 (ESC @) + bandCount * 8 (GS v 0 headers) + effectiveHeight * widthBytes + 7 (feed + cut)
        const totalSize = 2 + bandCount * 8 + effectiveHeight * widthBytes + 7;
        const buffer = new Uint8Array(totalSize);
        let pos = 0;

        // ESC @ (Initialize printer)
        buffer[pos++] = 0x1b;
        buffer[pos++] = 0x40;

        for (let yOffset = 0; yOffset < effectiveHeight; yOffset += sliceHeight) {
            const chunkHeight = Math.min(sliceHeight, effectiveHeight - yOffset);
            // GS v 0 0 xL xH yL yH
            buffer[pos++] = 0x1d;
            buffer[pos++] = 0x76;
            buffer[pos++] = 0x30;
            buffer[pos++] = 0x00;
            buffer[pos++] = widthBytes & 0xff;
            buffer[pos++] = (widthBytes >> 8) & 0xff;
            buffer[pos++] = chunkHeight & 0xff;
            buffer[pos++] = (chunkHeight >> 8) & 0xff;

            for (let row = 0; row < chunkHeight; row++) {
                const rowBase = (yOffset + row) * targetWidth * 4;
                for (let byteIdx = 0; byteIdx < widthBytes; byteIdx++) {
                    let byteVal = 0;
                    for (let bit = 0; bit < 8; bit++) {
                        const px = byteIdx * 8 + bit;
                        if (px < targetWidth) {
                            const idx = rowBase + px * 4;
                            if (rgba[idx + 3] >= 128) {
                                const lum = 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2];
                                if (lum < 200) {
                                    byteVal |= 1 << (7 - bit);
                                }
                            }
                        }
                    }
                    buffer[pos++] = byteVal;
                }
            }
        }

        // ESC d 4 (Feed 4 lines past printhead) + GS V B 0 (Single partial cut with feed)
        buffer[pos++] = 0x1b;
        buffer[pos++] = 0x64;
        buffer[pos++] = 0x04;
        buffer[pos++] = 0x1d;
        buffer[pos++] = 0x56;
        buffer[pos++] = 0x42;
        buffer[pos++] = 0x00;

        return this.uint8ArrayToBase64(pos === buffer.length ? buffer : buffer.subarray(0, pos));
    }

    /**
     * Sends raw ESC/POS raster bytes through QZ Tray (bypasses OS fixed page limits).
     */
    async printEscposRaw(targetPrinter, imageBase64, paperWidth = "80mm") {
        const escposBase64 = await this.imageToEscposBase64(imageBase64, paperWidth);
        const qzConfig = window.qz.configs.create(targetPrinter);
        await window.qz.print(qzConfig, [
            {
                type: "raw",
                format: "command",
                flavor: "base64",
                data: escposBase64,
            },
        ]);
    }

    /**
     * Prints an 80mm/58mm receipt image snapshot directly through QZ Tray
     * using continuous raw ESC/POS so long tickets never clip and end with a single cut.
     * @param {string} imageBase64 Pure base64 data of the rendered receipt image.
     * @param {string} preferredPrinterName Name of the printer (e.g. 'Bitaspain', 'POS-80').
     * @param {Object} [options] Optional overrides ({ paperWidth }).
     */
    async printReceiptImage(imageBase64, preferredPrinterName = null, options = {}) {
        if (!imageBase64 || imageBase64.length < 50) {
            throw new Error(_t("No receipt image data provided for printing."));
        }

        await this.connect();
        const targetPrinter = await this.resolvePrinter(preferredPrinterName);
        const printerName = typeof targetPrinter === "string"
            ? targetPrinter
            : (targetPrinter.name || "Default Printer");

        const paperWidth = options.paperWidth || this.printerPaperWidths[printerName] || "80mm";
        await this.printEscposRaw(targetPrinter, imageBase64, paperWidth);

        return {
            success: true,
            printer_name: printerName,
        };
    }
}

export const qzPrinterService = new QZPrinterService();
