/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ReprintReceiptButton } from "@point_of_sale/app/screens/ticket_screen/reprint_receipt_button/reprint_receipt_button";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { qzPrinterService } from "./QZPrinterService";
import { captureThermalReceipt } from "./ThermalReceiptHelper";

patch(ReprintReceiptButton.prototype, {
    setup() {
        super.setup();
        this.orm = useService("orm");
        this.renderer = useService("renderer");
        this.notification = useService("notification");
    },

    async click() {
        if (!this.props.order) {
            return;
        }

        if (!this.pos.config.enable_network_printing) {
            return await super.click(...arguments);
        }

        const order = this.props.order;
        const serverId = order.server_id || order.id || order.backendId;
        const config = this.pos.config;
        const preferredPrinter = (config.qz_printer_id && config.qz_printer_id[1])
            || config.qz_printer_name
            || config.printer_name
            || "";

        try {
            // First attempt: Reprint the exact preserved snapshot from pos.printed.ticket
            if (serverId && typeof serverId === "number") {
                try {
                    const ticket = await this.orm.call(
                        "pos.order",
                        "get_latest_ticket_snapshot",
                        [serverId]
                    );
                    if (ticket && ticket.receipt_snapshot) {
                        const printResult = await qzPrinterService.printReceiptImage(
                            ticket.receipt_snapshot,
                            preferredPrinter
                        );
                        this.notification.add(
                            _t("Original ticket reprinted via QZ Tray (%s)", printResult.printer_name || ""),
                            { type: "success" }
                        );
                        return;
                    }
                } catch (e) {
                    console.info("No prior snapshot found in database, rendering fresh receipt:", e);
                }
            }

            // Fallback: If no prior snapshot exists, render the receipt now and print
            if (order.is_to_invoice && order.is_to_invoice() && !order.account_move_name && serverId) {
                try {
                    const invInfo = await this.orm.call("pos.order", "get_order_invoice_info", [serverId]);
                    if (invInfo && invInfo.invoice_number) {
                        order.account_move_name = invInfo.invoice_number;
                    }
                } catch (_) {}
            }

            let targetNode = null;
            const liveReceiptEl = document.querySelector(".pos-receipt");
            if (liveReceiptEl) {
                targetNode = liveReceiptEl.cloneNode(true);
            } else if (this.renderer) {
                targetNode = await this.renderer.toHtml(OrderReceipt, {
                    data: order.export_for_printing(),
                    formatCurrency: this.env.utils.formatCurrency,
                });
            }

            if (!targetNode) {
                throw new Error(_t("Receipt element could not be found or rendered."));
            }

            const imageBase64 = await captureThermalReceipt(targetNode);

            let printerDisplayName = preferredPrinter || "Default";
            if (this.pos.config.simulation_mode) {
                this.notification.add(
                    _t("Ticket reprint simulated (Simulation Mode: physical print skipped)"),
                    { type: "info" }
                );
            } else {
                const printResult = await qzPrinterService.printReceiptImage(imageBase64, preferredPrinter);
                printerDisplayName = printResult.printer_name || preferredPrinter;
                this.notification.add(
                    _t("Ticket reprinted via QZ Tray (%s)", printerDisplayName),
                    { type: "success" }
                );
            }

            // Archive reprint in backend
            if (serverId && typeof serverId === "number") {
                try {
                    await this.orm.call(
                        "pos.order",
                        "log_printed_ticket",
                        [
                            serverId,
                            imageBase64,
                            "reprint",
                            printerDisplayName,
                            "success",
                            false,
                        ]
                    );
                } catch (_) {}
            }
            return;
        } catch (err) {
            console.error("QZ Tray reprint error:", err);
            this.notification.add(
                _t("QZ Tray Reprint Error: %s", err.message || err),
                { type: "danger" }
            );
        }

        // If local QZ print fails, fallback to standard behavior
        return await super.click(...arguments);
    },
});
