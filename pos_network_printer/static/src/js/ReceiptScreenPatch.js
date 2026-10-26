/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { toJpeg } from "@point_of_sale/app/utils/html-to-image";
import { loadAllImages } from "@point_of_sale/utils";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { onMounted } from "@odoo/owl";
import { qzPrinterService } from "./QZPrinterService";

patch(ReceiptScreen.prototype, {
    setup() {
        super.setup();
        this.notification = useService("notification");

        onMounted(() => {
            // Auto-print receipt upon reaching the ReceiptScreen if enabled in POS settings
            if (
                !this.isBill &&
                this.pos.config.enable_network_printing &&
                this.pos.config.auto_print_on_payment &&
                !this.currentOrder._network_printed
            ) {
                this.printNetworkReceipt();
            }
        });
    },

    async printReceipt() {
        if (this.pos.config.enable_network_printing) {
            return await this.printNetworkReceipt();
        }
        return await super.printReceipt(...arguments);
    },

    async printNetworkReceipt() {
        const order = this.currentOrder;
        if (!order) return;

        if (this.buttonPrintReceipt && this.buttonPrintReceipt.el) {
            this.buttonPrintReceipt.el.className = "fa fa-fw fa-spin fa-circle-o-notch";
        }

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

        try {
            // Fetch server order ID
            const orderName = typeof order.get_name === "function" ? order.get_name() : order.name;
            let serverOrderId =
                (this.pos.validated_orders_name_server_id_map && this.pos.validated_orders_name_server_id_map[orderName]) ||
                order.server_id ||
                (typeof order.id === "number" ? order.id : false);

            // If order only exists locally and this is NOT a bill, sync or push to get server ID
            if (!this.isBill && (!serverOrderId || typeof serverOrderId !== "number")) {
                const synced = await this.pos.push_single_order(order);
                if (synced && synced.length) {
                    serverOrderId = synced[0].id;
                }
            }

            if (!this.isBill && !serverOrderId) {
                throw new Error(_t("Could not synchronize order ID with the server."));
            }

            const isInvoice = typeof order.is_to_invoice === "function" ? order.is_to_invoice() : false;

            // If this is an invoice and invoice_number is not yet set on order, fetch it from backend
            if (isInvoice && !order.account_move_name && serverOrderId) {
                try {
                    const invInfo = await this.orm.call(
                        "pos.order",
                        "get_order_invoice_info",
                        [serverOrderId]
                    );
                    if (invInfo && invInfo.invoice_number) {
                        order.account_move_name = invInfo.invoice_number;
                    }
                } catch (e) {
                    console.warn("Could not fetch invoice sequence number:", e);
                }
            }

            let imageBase64 = null;
            let receiptEl = document.querySelector(".pos-receipt");

            // If isInvoice, only reuse DOM element if it already includes the invoice sequence number
            const domHasInvoiceNumber = Boolean(
                receiptEl &&
                receiptEl.isConnected &&
                (!isInvoice || (order.account_move_name && receiptEl.textContent.includes(order.account_move_name)))
            );

            // 1. If .pos-receipt is already rendered and up-to-date in the screen DOM, capture directly
            if (domHasInvoiceNumber) {
                applyStandardReceiptStyles(receiptEl);
                try {
                    await loadAllImages(receiptEl);
                } catch (_) {}
                const dataUrl = await toJpeg(receiptEl, {
                    skipFonts: true,
                    backgroundColor: "#ffffff",
                    pixelRatio: 2,
                    quality: 0.95,
                });
                if (dataUrl && dataUrl !== "data:," && dataUrl.length >= 100) {
                    imageBase64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
                }
            }

            // 2. If not already mounted, outdated, or capture failed, render cleanly via renderer
            if (!imageBase64 && this.renderer) {
                const generatedEl = await this.renderer.toHtml(OrderReceipt, {
                    data: {
                        ...order.export_for_printing(),
                        isBill: this.isBill,
                    },
                    formatCurrency: this.env.utils.formatCurrency,
                });

                if (generatedEl) {
                    if (this.renderer.whenMounted) {
                        imageBase64 = await this.renderer.whenMounted({
                            el: generatedEl,
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
                        const wrapper = document.createElement("div");
                        wrapper.style.position = "fixed";
                        wrapper.style.left = "-1000px";
                        wrapper.style.top = "0";
                        wrapper.style.width = "330px";
                        wrapper.style.opacity = "0";
                        wrapper.style.pointerEvents = "none";
                        applyStandardReceiptStyles(generatedEl);
                        wrapper.appendChild(generatedEl);
                        (document.querySelector(".pos") || document.body).appendChild(wrapper);
                        try {
                            try {
                                await loadAllImages(generatedEl);
                            } catch (_) {}
                            const dataUrl = await toJpeg(generatedEl, {
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
                }
            }

            if (!imageBase64 || imageBase64.length < 100) {
                throw new Error(_t("Failed to capture receipt image."));
            }

            const config = this.pos.config;
            const preferredPrinter = (config.qz_printer_id && config.qz_printer_id[1])
                || config.qz_printer_name
                || config.printer_name
                || "";
            let printerDisplayName = preferredPrinter || "Default";
            if (this.pos.config.simulation_mode) {
                console.log(`[Simulation Mode] Receipt for ${orderName} recorded without physical printing.`);
                this.notification.add(
                    _t("Receipt saved in history (Simulation Mode: physical print skipped)"),
                    { type: "info" }
                );
            } else {
                const printResult = await qzPrinterService.printReceiptImage(imageBase64, preferredPrinter);
                printerDisplayName = printResult.printer_name || preferredPrinter;
                this.notification.add(
                    _t("Receipt printed via QZ Tray (%s)", printerDisplayName),
                    { type: "success" }
                );
            }

            order._network_printed = true;

            // Archive visual snapshot in backend pos.printed.ticket
            try {
                const printType = this.isBill ? "bill" : (isInvoice ? "invoice" : "first_print");
                await this.orm.call(
                    "pos.order",
                    "log_printed_ticket",
                    [
                        serverOrderId || 0,
                        imageBase64,
                        printType,
                        printerDisplayName,
                        "success",
                        false,
                        orderName,
                    ]
                );
            } catch (err) {
                console.warn("Could not archive printed ticket in backend:", err);
            }
        } catch (err) {
            console.error("printNetworkReceipt error:", err);
            this.notification.add(
                _t("QZ Tray Print Error: %s", err.message || err),
                { type: "danger" }
            );
        } finally {
            if (this.buttonPrintReceipt && this.buttonPrintReceipt.el) {
                this.buttonPrintReceipt.el.className = "fa fa-print";
            }
        }
    },
});
