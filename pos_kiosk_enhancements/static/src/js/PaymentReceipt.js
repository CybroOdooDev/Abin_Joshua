/** @odoo-module **/

import {patch} from "@web/core/utils/patch";
import {KioskPaymentMethodPopup} from "@agr_kiosk_pay/js/kiosk_payment_popup";
import {renderToString} from "@web/core/utils/render";
import {useService} from "@web/core/utils/hooks";
import {_t} from "@web/core/l10n/translation";
import {toPng} from "@point_of_sale/app/utils/html-to-image";
import {loadAllImages} from "@point_of_sale/utils";

const PAID_ORDER_STATES = new Set(["paid", "done", "invoiced"]);
const MAX_RASTER_BAND_ROWS = 512;

export function resolveKioskVerifactuQrPath({showVerifactuQr, serverOrder}) {
    if (!showVerifactuQr || !serverOrder) {
        return "";
    }
    if (!PAID_ORDER_STATES.has(serverOrder.state)) {
        return "";
    }
    return serverOrder.l10n_es_edi_verifactu_qr_code || "";
}

export function resolveKioskPrinterName(posConfig, fallbackName = "USB Printer") {
    if (!posConfig) {
        return fallbackName;
    }
    return (
        (posConfig.qz_printer_id && posConfig.qz_printer_id[1]) ||
        posConfig.qz_printer_name ||
        posConfig.printer_name ||
        fallbackName
    );
}

export function uint8ToBase64(bytes) {
    const chunkSize = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

export function rgbaToEscposBytes(rgbaData, width, height, threshold = 205) {
    const bytesPerRow = Math.ceil(width / 8);
    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;

    const chunks = [];
    // ESC @ (Initialize printer)
    chunks.push(new Uint8Array([0x1b, 0x40]));

    for (let yStart = 0; yStart < height; yStart += MAX_RASTER_BAND_ROWS) {
        const bandRows = Math.min(MAX_RASTER_BAND_ROWS, height - yStart);
        const yL = bandRows & 0xff;
        const yH = (bandRows >> 8) & 0xff;

        // GS v 0 m xL xH yL yH (raster bit image, normal mode)
        const header = new Uint8Array([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
        const band = new Uint8Array(bytesPerRow * bandRows);

        for (let row = 0; row < bandRows; row++) {
            const y = yStart + row;
            const rowOffset = row * bytesPerRow;
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const a = rgbaData[idx + 3];
                if (a > 128) {
                    const lum =
                        0.299 * rgbaData[idx] +
                        0.587 * rgbaData[idx + 1] +
                        0.114 * rgbaData[idx + 2];
                    if (lum < threshold) {
                        band[rowOffset + (x >> 3)] |= 0x80 >> (x & 7);
                    }
                }
            }
        }
        chunks.push(header, band);
    }

    // ESC d 4 (feed 4 lines) + GS V B 0 (feed slightly & partial cut)
    chunks.push(new Uint8Array([0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00]));

    const totalLen = chunks.reduce((sum, arr) => sum + arr.length, 0);
    const out = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

async function captureKioskReceiptPng(receiptHtml, pixelRatio = 2) {
    const container = document.createElement("div");
    container.className = "kiosk-thermal-capture-root";
    Object.assign(container.style, {
        position: "fixed",
        left: "-9999px",
        top: "0",
        width: "288px",
        background: "#ffffff",
        color: "#000000",
        margin: "0",
        padding: "0",
        zIndex: "-1",
    });

    const styleEl = document.createElement("style");
    styleEl.textContent = `
        .kiosk-thermal-capture-root .pos-receipt {
            width: 288px !important;
            max-width: 288px !important;
            padding: 8px 6px !important;
            margin: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-weight: 700 !important;
            -webkit-font-smoothing: none !important;
            font-smooth: never !important;
            box-sizing: border-box !important;
        }
        .kiosk-thermal-capture-root .pos-receipt * {
            color: #000000 !important;
            font-weight: 700 !important;
            text-shadow: none !important;
        }
        .kiosk-thermal-capture-root .pos-receipt img {
            image-rendering: pixelated !important;
        }
    `;

    const bodyEl = document.createElement("div");
    bodyEl.innerHTML = receiptHtml;

    container.appendChild(styleEl);
    container.appendChild(bodyEl);
    document.body.appendChild(container);

    try {
        await loadAllImages(bodyEl);
        await new Promise((resolve) => setTimeout(resolve, 80));
        const targetEl = bodyEl.querySelector(".pos-receipt") || bodyEl.firstElementChild || bodyEl;
        return await toPng(targetEl, {
            backgroundColor: "#ffffff",
            pixelRatio,
            cacheBust: false,
        });
    } finally {
        container.remove();
    }
}

async function renderKioskThermalOutputs(dataUrl, paperWidthMm = 80, threshold = 205) {
    const targetWidth = Number(paperWidthMm) === 58 ? 384 : 576;
    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve, reject) => {
        if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
        }
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to decode kiosk receipt image"));
    });

    const targetHeight = Math.max(1, Math.round((img.height * targetWidth) / img.width));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const rgba = imageData.data;
    const escposBytes = rgbaToEscposBytes(rgba, targetWidth, targetHeight, threshold);

    // Snap preview canvas pixels to strict monochrome so simulated snapshots match printer output
    for (let i = 0; i < rgba.length; i += 4) {
        const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
        const v = rgba[i + 3] > 128 && lum < threshold ? 0 : 255;
        rgba[i] = v;
        rgba[i + 1] = v;
        rgba[i + 2] = v;
        rgba[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    return {
        monochromePngBase64: canvas.toDataURL("image/png").split(",")[1],
        escposBase64: uint8ToBase64(escposBytes),
    };
}

function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function round(value) {
    return Math.round(num(value) * 1000000) / 1000000;
}

function getProductPrice(product) {
    return num(
        product?.price_info?.display_price_default ??
        product?.lst_price ??
        product?.list_price ??
        product?.price ??
        0
    );
}

patch(KioskPaymentMethodPopup.prototype, {
    async setup() {
        this.notification = useService("notification");
        this.orm = useService("orm")
        super.setup();
        const [config] = await this.orm.read(
            "pos.config",
            [this.props.selfOrder.pos_config_id],
            ["name"]
        );
        const [company_logo] = await this.orm.read(
            "res.company",
            [this.props.selfOrder.company.id],
            ["logo"]
        );
        this.posName = config.name;
        this.company_logo = company_logo
    },
    async _getBase64FromUrl(url) {
        const res = await fetch(url, {credentials: "include"});
        const blob = await res.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.readAsDataURL(blob);
        });
    },

    _getProduct(productId) {
        return (this.props.selfOrder.products || []).find((p) => p.id === productId);
    },

    _getComboLine(comboLineId) {
        for (const combo of this.props.selfOrder.combos || []) {
            for (const cl of combo.combo_line_ids || []) {
                if (cl.id === comboLineId) {
                    return cl;
                }
            }
        }
        return null;
    },

    _getComboByChildLine(comboLineId) {
        for (const combo of this.props.selfOrder.combos || []) {
            for (const cl of combo.combo_line_ids || []) {
                if (cl.id === comboLineId) {
                    return combo;
                }
            }
        }
        return null;
    },
    _buildTaxPayload(order) {
        const payload = [];
        const lines = order.lines || [];
        let i = 0;
        while (i < lines.length) {
            const parent = lines[i];
            if (parent.combo_parent_uuid) {
                i++;
                continue;
            }
            const parentProduct = this._getProduct(parent.product_id);
            const comboPrice = round(
                getProductPrice(parentProduct) *
                num(parent.qty || 1)
            );
            const children = [];
            let j = i + 1;
            while (j < lines.length && lines[j].combo_parent_uuid) {
                children.push(lines[j]);
                j++;
            }
            if (!children.length) {
                payload.push({
                    product_id: parent.product_id,
                    quantity: num(parent.qty || 1),
                    price_unit: comboPrice,
                });
                i = j;
                continue;
            }
            const computedChildren = this._computeComboChildren(children);
            const refs = computedChildren.map((child) => {
                const product = this._getProduct(child.line.product_id);
                return {
                    child,
                    reference:
                        num(
                            product?.lst_price ??
                            product?.list_price ??
                            product?.price_info?.display_price_default ??
                            product?.price ??
                            0
                        ) * num(child.totalQty || 1),
                };
            });
            const totalReference = refs.reduce(
                (sum, item) => sum + item.reference,
                0
            );
            for (const item of refs) {
                const allocatedAmount =
                    totalReference > 0
                        ? comboPrice *
                        (item.reference / totalReference)
                        : 0;
                const extraAmount = num(item.child.price);
                payload.push({
                    product_id: item.child.line.product_id,
                    quantity: 1,
                    price_unit: round(
                        allocatedAmount + extraAmount
                    ),
                });
            }
            i = j;
        }
        return payload;
    },

    _getComboLinePrice(line) {
        const comboLine = this._getComboLine(line.combo_line_id);

        return num(
            comboLine?.combo_price ??
            comboLine?.price_extra ??
            comboLine?.price ??
            line._originalUnitPrice ??
            line.originalUnitPrice ??
            line.combo_price ??
            line.price_extra ??
            0
        );
    },
    _computeComboChildren(children) {
        const result = [];
        const remainingFreeByChoice = {};

        for (const line of children) {
            const combo = this._getComboByChildLine(line.combo_line_id);
            const choiceId = combo?.id || line.combo_line_id;

            if (!(choiceId in remainingFreeByChoice)) {
                remainingFreeByChoice[choiceId] = num(combo?.free_limit || 0);
            }

            const unitPrice = this._getComboLinePrice(line);

            // If allow_quantity is disabled, force qty = 1
            const qty = combo?.allow_quantity
                ? num(line.qty || 1)
                : 1;

            let freeQty = 0;
            let paidQty = qty;

            // Only apply free limit if limit > 0
            if (remainingFreeByChoice[choiceId] > 0) {
                freeQty = Math.min(qty, remainingFreeByChoice[choiceId]);
                paidQty = Math.max(qty - freeQty, 0);

                remainingFreeByChoice[choiceId] = Math.max(
                    remainingFreeByChoice[choiceId] - freeQty,
                    0
                );
            }
            result.push({
                line,
                freeQty,
                paidQty,
                totalQty: qty,
                unitPrice,
                price: round(paidQty * unitPrice),
            });
        }
        return result;
    },

    _buildProcessedLines(order) {
        const processedLines = [];
        const lines = order.lines || [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            if (line.combo_parent_uuid) {
                i++;
                continue;
            }

            const product = this._getProduct(line.product_id);
            const parentPrice = round(getProductPrice(product) * num(line.qty || 1));

            const newLine = {
                name: line.full_product_name,
                qty: line.qty,
                price: parentPrice,
                components: [],
            };

            const children = [];
            let j = i + 1;

            while (j < lines.length && lines[j].combo_parent_uuid) {
                children.push(lines[j]);
                j++;
            }

            const computedChildren = this._computeComboChildren(children);

            for (const child of computedChildren) {
                const cleanName = (child.line.full_product_name || "")
                    .replace(/\s*×\d+$/, "")
                    .trim();
                newLine.components.push({
                    name: cleanName,
                    freeQty: child.freeQty,
                    paidQty: child.paidQty,
                    totalQty: num(child.line.qty || 1),
                    unitPrice: child.unitPrice,
                    price: child.price,
                    is_extra: child.paidQty > 0,
                    show_price: child.paidQty > 0 && child.price > 0,
                    is_free: child.freeQty > 0 && child.paidQty === 0,
                    is_partial: child.freeQty > 0 && child.paidQty > 0,
                });
            }

            processedLines.push(newLine);
            i = j;
        }

        return processedLines;
    },

    _computeCorrectTotal(order) {
        let total = 0;
        const lines = order.lines || [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            if (line.combo_parent_uuid) {
                i++;
                continue;
            }

            const product = this._getProduct(line.product_id);
            total += getProductPrice(product) * num(line.qty || 1);

            const children = [];
            let j = i + 1;

            while (j < lines.length && lines[j].combo_parent_uuid) {
                children.push(lines[j]);
                j++;
            }

            const computedChildren = this._computeComboChildren(children);

            for (const child of computedChildren) {
                total += child.price;
            }

            i = j;
        }

        return round(total);
    },

    async _printReceipt(order, method) {
        const baseUrl = window.location.origin;
        const config = this.props.selfOrder.config;
        const selfOrder = this.props.selfOrder;

        if (typeof selfOrder.sendDraftOrderToServer === "function") {
            await selfOrder.sendDraftOrderToServer();
        }
        await this._saveComboMetadataToServer(order);

        const processedLines = this._buildProcessedLines(order);
        const correctTotal = this._computeCorrectTotal(order);
        const taxPayload = this._buildTaxPayload(order);
        const taxResult = await this.orm.call(
            "pos.order",
            "compute_kiosk_tax_breakdown",
            [taxPayload]
        )
        const totalTax = round(order.amount_tax || 0);

        const taxDetails = [...(taxResult.tax_details || [])];

        const breakdownTotal = round(
            taxDetails.reduce(
                (sum, line) => sum + num(line.amount),
                0
            )
        );

        const diff = round(totalTax - breakdownTotal);

        // Force breakdown to match Odoo total exactly
        if (Math.abs(diff) >= 0.000001 && taxDetails.length) {
            taxDetails.sort((a, b) => b.amount - a.amount);

            taxDetails[0].amount = round(
                num(taxDetails[0].amount) + diff
            );
        }

        // Normalize to the exact shape the POS receipt screen expects
        // ({ tax: { id, name, amount }, amount, base }) before persisting,
        // so it can be reused as-is when this order is scanned at the till.
        const normalizedTaxDetails = taxDetails.map((line) => ({
            tax: {
                id: line.tax?.id,
                name: line.tax?.name,
                amount: num(line.tax?.amount, 0),
            },
            amount: num(line.amount, 0),
            base: num(line.base, 0),
        }));

        if (order.id) {
            try {
                await this.orm.call("pos.order", "save_kiosk_tax_breakdown", [
                    [order.id],
                    normalizedTaxDetails,
                    totalTax,
                ]);
            } catch (e) {
                console.warn("Failed to persist kiosk tax breakdown", e);
            }
        }
        const untaxed = round(correctTotal - totalTax);
        const encodedRef = encodeURIComponent(order.pos_reference || "");
        const qrUrl = `${baseUrl}/report/barcode/QR/${encodedRef}`;
        const barcodeUrl = `${baseUrl}/report/barcode/Code128/${encodedRef}`;
        let qr_base64 = "";
        let barcode_base64 = "";
        try {
            qr_base64 = await this._getBase64FromUrl(qrUrl);
            barcode_base64 = await this._getBase64FromUrl(barcodeUrl);
        } catch (e) {
            console.warn("Barcode generation failed", e);
        }

        let verifactu_qr_base64 = "";
        if (config.show_verifactu_qr && order.id) {
            try {
                const [serverOrder] = await this.orm.read(
                    "pos.order",
                    [order.id],
                    ["state", "l10n_es_edi_verifactu_qr_code"]
                );
                const verifactuBarcodeUrl = resolveKioskVerifactuQrPath({
                    showVerifactuQr: config.show_verifactu_qr,
                    serverOrder,
                });
                if (verifactuBarcodeUrl) {
                    const fullUrl = verifactuBarcodeUrl.startsWith("http")
                        ? verifactuBarcodeUrl
                        : `${baseUrl}${verifactuBarcodeUrl}`;
                    verifactu_qr_base64 = await this._getBase64FromUrl(fullUrl);
                }
            } catch (e) {
                console.warn("VeriFactu QR generation failed", e);
            }
        }

        const company = this.props.selfOrder.company || {};
        const receiptData = {
            order: {
                name: order.tracking_number,
                lines: processedLines,

                untaxed: untaxed,
                tax: totalTax,
                total: correctTotal,

                payment_method: method.name,
                is_pay_at_counter: !method.is_cashsecurity_payment,
                identifier: order.pos_reference,
                identifierDisplay: order.pos_reference || order.name,
                is_takeaway: order.take_away || false,
                reference: order.pos_reference,
            },

            company: {
                name: company.name,
                vat: company.vat,
                vat_label: company.country?.vat_label || "VAT",
                address: company.partner_id?.[1] || "",
                logo: this.company_logo.logo || false,
            },

            pos: {
                name: this.posName || "POS",
            },

            tax_details: taxResult.tax_details,

            qr_base64,
            barcode_base64,
            verifactu_qr_base64,
            config_flags: {
                show_qr: config.show_qr,
                show_barcode: config.show_barcode,
                show_both: config.show_both,
                show_verifactu_qr: config.show_verifactu_qr,
                takeaway_enabled: config.self_ordering_takeaway,
            },
        };
        await this._printWithQZ(receiptData, order);
    },
    async _saveComboMetadataToServer(order) {
        const lines = order.lines || [];
        const metaList = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            if (line.combo_parent_uuid) {
                i++;
                continue;
            }

            // collect children
            const children = [];
            let j = i + 1;
            while (j < lines.length && lines[j].combo_parent_uuid) {
                children.push(lines[j]);
                j++;
            }

            const computed = this._computeComboChildren(children);

            for (let k = 0; k < children.length; k++) {
                const child = children[k];
                const comp = computed[k];
                if (!child.id) continue; // skip unsaved lines

                metaList.push({
                    id: child.id,
                    selected_qty: comp.totalQty,
                    paid_qty: comp.paidQty,
                    free_qty: comp.freeQty,
                    combo_price: comp.unitPrice,
                });
            }

            i = j;
        }

        if (metaList.length) {
            await this.orm.call(
                "pos.order",
                "save_combo_line_metadata",
                [metaList]
            );
        }
    },
    async _printWithQZ(receiptData, order = null) {
        const pos_config = this.props.selfOrder.config;

        try {
            const templateName = "agr_kiosk_pay.PaymentReceipt";
            const receiptHtml = renderToString(templateName, {
                data: receiptData,
            });

            const pngDataUrl = await captureKioskReceiptPng(receiptHtml, 2);
            const paperWidthMm = Number(pos_config && pos_config.printer_paper_width) === 58 ? 58 : 80;
            const { monochromePngBase64, escposBase64 } = await renderKioskThermalOutputs(pngDataUrl, paperWidthMm);
            const printerName = resolveKioskPrinterName(pos_config, _t("USB Printer"));

            if (pos_config && pos_config.simulation_mode) {
                if (typeof window !== "undefined") {
                    window.__lastSimulatedKioskReceipt = `data:image/png;base64,${monochromePngBase64}`;
                }
                const orderRef = (receiptData && receiptData.order && (receiptData.order.reference || receiptData.order.name)) || "";
                const printType = (receiptData && receiptData.order && receiptData.order.is_pay_at_counter) ? "bill" : "first_print";
                try {
                    await this.orm.call(
                        "pos.order",
                        "log_printed_ticket",
                        [
                            (order && order.id) || 0,
                            monochromePngBase64,
                            printType,
                            printerName,
                            "success",
                            false,
                            orderRef || false,
                        ]
                    );
                } catch (logErr) {
                    console.warn("[Simulation Mode] Could not archive kiosk receipt in pos.printed.ticket:", logErr);
                }
                console.info(`[Simulation Mode] Kiosk receipt for ${orderRef} captured without physical QZ print.`);
                this.notification.add(
                    _t("Kiosk receipt saved in history (Simulation Mode: physical print skipped)"),
                    {type: "info"}
                );
                return;
            }

            qz.security.setSignatureAlgorithm("SHA512");

            qz.security.setCertificatePromise(async () => {
                const response = await fetch("/qz/certificate");
                return response.text();
            });

            qz.security.setSignaturePromise(async (toSign) => {
                const response = await fetch("/qz/sign", {
                    method: "POST",
                    headers: {
                        "Content-Type": "text/plain",
                    },
                    body: toSign,
                });
                return response.text();
            });
            if (!qz.websocket.isActive()) {
                await qz.websocket.connect();
            }

            const qzConfig = qz.configs.create(printerName);

            await qz.print(qzConfig, [{
                type: "raw",
                format: "command",
                flavor: "base64",
                data: escposBase64,
            }]);
        } catch (err) {
            console.error(err);

            this.notification.add(
                "Printer Error: " + err.message,
                {type: "danger"}
            );
        }
    }
});