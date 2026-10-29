/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";

class QZPrinterService {
    constructor() {
        this.isConnected = false;
        this.isSecuritySetup = false;
        this._connectPromise = null;
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
     * Prints an 80mm receipt image snapshot directly through QZ Tray.
     * @param {string} imageBase64 Pure base64 data of the rendered receipt image.
     * @param {string} preferredPrinterName Name of the printer (e.g. 'Bitaspain', 'POS-80').
     */
    async printReceiptImage(imageBase64, preferredPrinterName = null) {
        if (!imageBase64 || imageBase64.length < 50) {
            throw new Error(_t("No receipt image data provided for printing."));
        }

        await this.connect();
        const targetPrinter = await this.resolvePrinter(preferredPrinterName);

        const qzConfig = window.qz.configs.create(targetPrinter, {
            size: { width: 80, height: 297 },
            units: "mm",
            margins: 0,
            scaleContent: true,
            colorType: "blackwhite",
            interpolation: "nearest-neighbor",
            rasterize: true,
        });

        const printData = [
            {
                type: "pixel",
                format: "image",
                flavor: "base64",
                data: imageBase64,
            },
        ];

        await window.qz.print(qzConfig, printData);
        return {
            success: true,
            printer_name: typeof targetPrinter === "string" ? targetPrinter : (targetPrinter.name || "Default Printer"),
        };
    }
}

export const qzPrinterService = new QZPrinterService();
