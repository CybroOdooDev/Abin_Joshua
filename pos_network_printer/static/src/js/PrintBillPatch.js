/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PrintBillButton } from "@pos_restaurant/app/control_buttons/print_bill_button/print_bill_button";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { toJpeg } from "@point_of_sale/app/utils/html-to-image";
import { loadAllImages } from "@point_of_sale/utils";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

patch(PrintBillButton.prototype, {
    setup() {
        super.setup(...arguments);
        this.renderer = useService("renderer");
        this.notification = useService("notification");
        this.orm = useService("orm");
    },

    async click() {
        if (!this.pos.config.enable_network_printing) {
            return await super.click(...arguments);
        }

        const order = this.pos.get_order();
        if (!order || order.get_orderlines().length === 0) {
            return;
        }

        try {
            // Render receipt matching payment receipt format exactly
            const receiptData = {
                ...order.export_for_printing(),
                isBill: false,
            };

            // Ensure Veri*Factu QR code is present just like on payment receipt
            if (this.pos.config.l10n_es_edi_verifactu_required && !receiptData.l10n_es_edi_verifactu_qr_code) {
                const vat = (this.pos.company.vat || "").replace(/^[A-Z]{2}/, "");
                const numserie = typeof order.get_name === "function" ? order.get_name() : order.name;
                const now = new Date();
                const day = String(now.getDate()).padStart(2, "0");
                const month = String(now.getMonth() + 1).padStart(2, "0");
                const year = now.getFullYear();
                const fecha = `${day}-${month}-${year}`;
                const totalWithTax = typeof order.get_total_with_tax === "function" ? order.get_total_with_tax() : (order.total_with_tax || 0);
                const importe = totalWithTax.toFixed(2);
                const endpoint = "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR";
                const qrUrl = `${endpoint}?nif=${encodeURIComponent(vat)}&numserie=${encodeURIComponent(numserie)}&fecha=${encodeURIComponent(fecha)}&importe=${encodeURIComponent(importe)}`;
                receiptData.l10n_es_edi_verifactu_qr_code = `/report/barcode/?barcode_type=QR&value=${encodeURIComponent(qrUrl)}&barLevel=M&width=180&height=180`;
            }

            const receiptEl = await this.renderer.toHtml(OrderReceipt, {
                data: receiptData,
                formatCurrency: this.env.utils.formatCurrency,
            });

            if (!receiptEl) {
                return await super.click(...arguments);
            }

            // Apply exact 330px width and 16px font matching on-screen ReceiptScreen
            const applyStandardReceiptStyles = (el) => {
                el.style.width = "330px";
                el.style.maxWidth = "330px";
                el.style.minWidth = "330px";
                el.style.boxSizing = "border-box";
                el.style.margin = "0 auto";
                el.style.padding = "10px 15px";
                el.style.backgroundColor = "#ffffff";
                el.style.fontSize = "16px";
            };

            let imageBase64 = null;
            if (this.renderer && this.renderer.whenMounted) {
                imageBase64 = await this.renderer.whenMounted({
                    el: receiptEl,
                    callback: async (mountedEl) => {
                        applyStandardReceiptStyles(mountedEl);
                        try {
                            await loadAllImages(mountedEl);
                        } catch (_) {}
                        const dataUrl = await toJpeg(mountedEl, {
                            skipFonts: true,
                            backgroundColor: "#ffffff",
                            pixelRatio: 2,
                            quality: 0.95,
                        });
                        return dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
                    },
                });
            } else {
                // Safe offscreen wrapper inside .pos
                const wrapper = document.createElement("div");
                wrapper.style.position = "fixed";
                wrapper.style.left = "-1000px";
                wrapper.style.top = "0";
                wrapper.style.width = "330px";
                wrapper.style.opacity = "0";
                wrapper.style.pointerEvents = "none";
                applyStandardReceiptStyles(receiptEl);
                wrapper.appendChild(receiptEl);
                (document.querySelector(".pos") || document.body).appendChild(wrapper);
                try {
                    try {
                        await loadAllImages(receiptEl);
                    } catch (_) {}
                    const dataUrl = await toJpeg(receiptEl, {
                        skipFonts: true,
                        backgroundColor: "#ffffff",
                        pixelRatio: 2,
                        quality: 0.95,
                    });
                    imageBase64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
                } finally {
                    wrapper.remove();
                }
            }

            if (!imageBase64 || imageBase64.length < 100) {
                throw new Error(_t("Failed to capture bill receipt image."));
            }

            // Fetch server order ID if synced
            const orderName = typeof order.get_name === "function" ? order.get_name() : order.name;
            const serverOrderId =
                (this.pos.validated_orders_name_server_id_map && this.pos.validated_orders_name_server_id_map[orderName]) ||
                order.server_id ||
                (typeof order.id === "number" ? order.id : 0);

            const printerId = this.pos.config.network_printer_id ? this.pos.config.network_printer_id[0] : false;
            const result = await this.orm.call(
                "pos.order",
                "print_network_receipt_from_ui",
                [serverOrderId || 0, imageBase64, printerId, "bill"]
            );

            if (result && result.success) {
                this.notification.add(
                    _t("Pre-payment bill printed on %s", result.printer_name || ""),
                    { type: "success" }
                );
            } else {
                this.notification.add(
                    _t("Network Printer: %s", (result && result.message) || _t("Could not print bill")),
                    { type: "warning" }
                );
                this.pos.showTempScreen("BillScreen");
            }
        } catch (err) {
            console.error("PrintBillButton network print failed:", err);
            return await super.click(...arguments);
        }
    },
});
