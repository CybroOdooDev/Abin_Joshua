/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { onMounted } from "@odoo/owl";

patch(ReceiptScreen.prototype, {
    setup() {
        super.setup();
        this.notification = useService("notification");

        onMounted(() => {
            // Auto-print receipt upon reaching the ReceiptScreen if enabled in POS settings
            if (
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

        if (this.buttonPrintReceipt?.el) {
            this.buttonPrintReceipt.el.className = "fa fa-fw fa-spin fa-circle-o-notch";
        }

        try {
            // Render the exact receipt component to high-resolution JPEG image
            const imageBase64 = await this.renderer.toJpeg(
                OrderReceipt,
                {
                    data: {
                        ...order.export_for_printing(),
                        isBill: this.isBill,
                    },
                    formatCurrency: this.env.utils.formatCurrency,
                }
            );

            // Fetch server order ID (if already synced, order.server_id or order.id)
            let serverOrderId = order.server_id || order.id;

            // If order only exists in offline/local indexedDB, sync draft or get id
            if (!serverOrderId || typeof serverOrderId !== "number") {
                const synced = await this.pos.push_single_order(order);
                if (synced && synced.length) {
                    serverOrderId = synced[0].id;
                }
            }

            if (!serverOrderId) {
                throw new Error(_t("Could not synchronize order ID to send to network printer."));
            }

            const result = await this.orm.call(
                "pos.order",
                "print_network_receipt_from_ui",
                [serverOrderId, imageBase64, this.pos.config.network_printer_id?.[0]]
            );

            if (result.success) {
                order._network_printed = true;
                this.notification.add(
                    _t("Receipt sent to printer: %s", result.printer_name || ""),
                    { type: "success" }
                );
            } else {
                this.notification.add(
                    _t("Network Printer: %s", result.message || _t("Failed to print")),
                    { type: "warning", sticky: true }
                );
            }
        } catch (error) {
            console.error("Network print failed:", error);
            this.notification.add(
                _t("Network print error: %s", error.message || error),
                { type: "danger" }
            );
        } finally {
            if (this.buttonPrintReceipt?.el) {
                this.buttonPrintReceipt.el.className = "fa fa-print";
            }
        }
    },
});
