/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { onMounted } from "@odoo/owl";
import { qzPrinterService } from "./QZPrinterService";
import { captureThermalReceipt } from "./ThermalReceiptHelper";

patch(ReceiptScreen.prototype, {
    setup() {
        super.setup();
        this.notification = useService("notification");
        this.report = useService("report");

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

            const isPaid = Boolean(
                ["paid", "done", "invoiced"].includes(order.state) ||
                (typeof order.is_paid === "function" ? order.is_paid() : (order.get_due ? order.get_due() <= 0 : false))
            );
            const verifactuOrderId = serverOrderId || order.receipt_protected_order_id;

            // If settled and Veri*Factu QR wasn't yet loaded into JS (e.g. kiosk counter payment), fetch and assign it before printing
            if (
                isPaid &&
                !this.isBill &&
                this.pos.config.l10n_es_edi_verifactu_required &&
                !order.l10n_es_edi_verifactu_qr_code &&
                verifactuOrderId
            ) {
                try {
                    const verifactuRows = typeof order.fetch_l10n_es_edi_verifactu_qr_code === "function"
                        ? await order.fetch_l10n_es_edi_verifactu_qr_code([verifactuOrderId])
                        : await this.orm.read("pos.order", [verifactuOrderId], ["l10n_es_edi_verifactu_qr_code"]);
                    if (verifactuRows && verifactuRows[0] && verifactuRows[0].l10n_es_edi_verifactu_qr_code) {
                        order.l10n_es_edi_verifactu_qr_code = verifactuRows[0].l10n_es_edi_verifactu_qr_code;
                    }
                } catch (e) {
                    console.warn("Could not fetch VeriFactu QR code:", e);
                }
            }

            let imageBase64 = null;
            const receiptEl = document.querySelector(".pos-receipt");
            const domNeedsVerifactuQr = Boolean(
                isPaid &&
                !this.isBill &&
                this.pos.config.l10n_es_edi_verifactu_required &&
                order.l10n_es_edi_verifactu_qr_code
            );

            // Only reuse live DOM element when it matches bill/invoice/Veri*Factu state
            const domHasInvoiceNumber = Boolean(
                receiptEl &&
                receiptEl.isConnected &&
                !this.isBill &&
                (!isInvoice || (order.account_move_name && receiptEl.textContent.includes(order.account_move_name))) &&
                (!domNeedsVerifactuQr || receiptEl.textContent.includes("VERI*FACTU"))
            );

            // 1. If .pos-receipt is already rendered and up-to-date in the screen DOM, clone and capture in offscreen thermal wrapper
            if (domHasInvoiceNumber) {
                const cloneEl = receiptEl.cloneNode(true);
                imageBase64 = await captureThermalReceipt(cloneEl);
            }

            // 2. If not already mounted, outdated, or capture failed, render cleanly via renderer
            if (!imageBase64 && this.renderer) {
                const exportData = {
                    ...order.export_for_printing(),
                    isBill: this.isBill,
                };
                if (this.isBill || !isPaid) {
                    exportData.l10n_es_edi_verifactu_qr_code = false;
                }
                const generatedEl = await this.renderer.toHtml(OrderReceipt, {
                    data: exportData,
                    formatCurrency: this.env.utils.formatCurrency,
                });

                if (generatedEl) {
                    imageBase64 = await captureThermalReceipt(generatedEl);
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

    async downloadInvoicePdf() {
        const order = this.currentOrder;
        if (!order) return;
        const orderName = typeof order.get_name === "function" ? order.get_name() : order.name;
        let serverOrderId =
            (this.pos.validated_orders_name_server_id_map && this.pos.validated_orders_name_server_id_map[orderName]) ||
            order.server_id ||
            (typeof order.id === "number" ? order.id : false);
        if (!serverOrderId) {
            this.notification.add(_t("Order not yet synced to server."), { type: "warning" });
            return;
        }
        try {
            const invInfo = await this.orm.call("pos.order", "get_order_invoice_info", [serverOrderId]);
            if (invInfo && invInfo.invoice_id) {
                return await this.report.doAction("pos_network_printer.report_invoice_ticket_80mm", [invInfo.invoice_id]);
            } else {
                this.notification.add(_t("No invoice found for this order."), { type: "warning" });
            }
        } catch (err) {
            console.error("Could not download invoice PDF:", err);
            this.notification.add(_t("Error downloading invoice PDF: %s", err.message || err), { type: "danger" });
        }
    },
});
