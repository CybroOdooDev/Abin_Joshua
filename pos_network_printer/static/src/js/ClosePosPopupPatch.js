/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ClosePosPopup } from "@point_of_sale/app/navbar/closing_popup/closing_popup";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { parseFloat } from "@web/views/fields/parsers";
import { CashClosingReceipt } from "./CashClosingReceipt";
import { qzPrinterService } from "./QZPrinterService";
import { captureThermalReceipt } from "./ThermalReceiptHelper";

patch(ClosePosPopup.prototype, {
    setup() {
        super.setup(...arguments);
        this.renderer = useService("renderer");
        this.notification = useService("notification");
    },

    /**
     * Prints the Cash Closing Report either as an 80mm thermal receipt or A4 PDF,
     * dynamically fetching all payment methods and CashSecurity balances.
     */
    async printCashClosingReport() {
        try {
            const config = this.pos.config;
            const printerType = config.cash_closing_printer_type || "receipt";

            // If cash control is active, persist current counted cash so data is 100% current
            if (this.pos.config.cash_control && this.props.default_cash_details?.id) {
                const countedVal = this.state.payments[this.props.default_cash_details.id]?.counted;
                if (countedVal && this.env.utils.isValidFloat(countedVal)) {
                    await this.orm.call("pos.session", "post_closing_cash_details", [
                        this.pos.pos_session.id,
                        parseFloat(countedVal),
                    ]);
                }
            }

            // 1. A4 Printer Output
            if (printerType === "a4") {
                await this.report.doAction(
                    "pos_network_printer.action_report_pos_cash_closing",
                    [this.pos.pos_session.id]
                );
                this.notification?.add(_t("Generating A4 Cash Closing Report..."), { type: "info" });
                return true;
            }

            // 2. Receipt Printer Output (Default)
            const reportData = await this.orm.call(
                "pos.session",
                "get_cash_closing_report_data",
                [this.pos.pos_session.id]
            );

            if (!reportData) {
                throw new Error(_t("Could not retrieve session closing report data."));
            }

            const receiptEl = await this.renderer.toHtml(CashClosingReceipt, {
                data: reportData,
                formatCurrency: this.env.utils.formatCurrency,
                currentDate: new Date().toLocaleString(),
            });

            if (!receiptEl) {
                throw new Error(_t("Failed to generate thermal receipt element."));
            }

            // Route to QZ Tray if enabled
            if (config.enable_network_printing) {
                const imageBase64 = await captureThermalReceipt(receiptEl);
                if (!imageBase64 || imageBase64.length < 50) {
                    throw new Error(_t("Failed to render thermal receipt image snapshot."));
                }

                const preferredPrinter =
                    (config.qz_printer_id && config.qz_printer_id[1]) ||
                    config.qz_printer_name ||
                    config.printer_name ||
                    "";

                if (config.simulation_mode) {
                    console.log("[Simulation Mode] Cash closing report printed virtually.");
                    this.notification?.add(
                        _t("Cash Closing Report saved (Simulation Mode: physical print skipped)"),
                        { type: "info" }
                    );
                } else {
                    const printResult = await qzPrinterService.printReceiptImage(
                        imageBase64,
                        preferredPrinter
                    );
                    this.notification?.add(
                        _t("Cash Closing Report printed via QZ Tray (%s)", printResult.printer_name || "Receipt Printer"),
                        { type: "success" }
                    );
                }
                return true;
            }

            // Fallback: standard hardware proxy printer or browser print
            if (this.hardwareProxy && this.hardwareProxy.printer) {
                await this.hardwareProxy.printer.printReceipt(receiptEl);
                this.notification?.add(_t("Cash Closing Report printed via POS printer"), { type: "success" });
                return true;
            }

            // Fallback: browser print window
            const printWindow = window.open("", "_blank", "width=400,height=600");
            if (printWindow) {
                printWindow.document.write("<html><head><title>Cash Closing Report</title></head><body>");
                printWindow.document.write(receiptEl.outerHTML);
                printWindow.document.write("</body></html>");
                printWindow.document.close();
                printWindow.focus();
                printWindow.print();
                printWindow.close();
            }
            return true;
        } catch (err) {
            console.error("Error printing Cash Closing Report:", err);
            this.notification?.add(
                _t("Error printing Cash Closing Report: %s", err.message || err),
                { type: "danger" }
            );
            return false;
        }
    },

    /**
     * Override closeSession to auto-print report if enabled.
     */
    async closeSession() {
        if (this.pos.config.auto_print_cash_closing) {
            try {
                await this.printCashClosingReport();
            } catch (printErr) {
                console.warn("Auto-print on close warning:", printErr);
            }
        }
        return await super.closeSession(...arguments);
    },
});
