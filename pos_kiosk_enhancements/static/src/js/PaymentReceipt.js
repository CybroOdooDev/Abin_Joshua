/** @odoo-module **/

import {patch} from "@web/core/utils/patch";
import {KioskPaymentMethodPopup} from "@agr_kiosk_pay/js/kiosk_payment_popup";
import {renderToString} from "@web/core/utils/render";
import {useService} from "@web/core/utils/hooks";
import {_t} from "@web/core/l10n/translation";

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
        const qrUrl = `${baseUrl}/report/barcode/QR/${order.pos_reference}`;
        const barcodeUrl = `${baseUrl}/report/barcode/Code128/${order.pos_reference}`;
        let qr_base64 = "";
        let barcode_base64 = "";
        try {
            qr_base64 = await this._getBase64FromUrl(qrUrl);
            barcode_base64 = await this._getBase64FromUrl(barcodeUrl);
        } catch (e) {
            console.warn("Barcode generation failed", e);
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
            config_flags: {
                show_qr: config.show_qr,
                show_barcode: config.show_barcode,
                show_both: config.show_both,
                takeaway_enabled: config.self_ordering_takeaway,
            },
        };
        await this._printWithQZ(receiptData);
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
    async _printWithQZ(receiptData) {
        const pos_config = this.props.selfOrder.config;

        try {
            const templateName = "agr_kiosk_pay.PaymentReceipt";

            const receiptHtml = renderToString(templateName, {
                data: receiptData,
            });

            const options = {
                margin: 0,
                filename: `Receipt_${receiptData.order.name}.pdf`,
                image: {
                    type: "jpeg",
                    quality: 1,
                },
                html2canvas: {
                    scale: 4,
                    useCORS: true,
                    letterRendering: true,
                },
                jsPDF: {
                    unit: "mm",
                    format: [80, 400],
                },
            };

            // Create worker once
            const worker = html2pdf()
                .set(options)
                .from(receiptHtml);

            // Keep automatic download
            await worker.save();

            // Generate PDF blob from the same content
            const pdfBlob = await worker.outputPdf("blob");

            // Convert blob to base64 for QZ Tray
            const pdfBase64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();

                reader.onloadend = () => {
                    resolve(reader.result.split(",")[1]);
                };

                reader.onerror = reject;
                reader.readAsDataURL(pdfBlob);
            });

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

            const printerName = pos_config.printer_name || _t("USB Printer");
            const qzConfig = qz.configs.create(printerName, {
                size: {width: 80},
                units: "mm",
            });

            await qz.print(qzConfig, [{
                type: "pdf",
                format: "base64",
                data: pdfBase64,
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