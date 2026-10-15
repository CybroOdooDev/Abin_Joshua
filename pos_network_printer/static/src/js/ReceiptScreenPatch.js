/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { toJpeg } from "@point_of_sale/app/utils/html-to-image";
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

        if (this.buttonPrintReceipt?.el) {
            this.buttonPrintReceipt.el.className = "fa fa-fw fa-spin fa-circle-o-notch";
        }

        try {
            // Render receipt image directly without triggering remote webfont embedding (avoids font 404s)
            let receiptEl = document.querySelector(".pos-receipt");
            if (!receiptEl && this.renderer) {
                receiptEl = await this.renderer.toHtml(OrderReceipt, {
                    data: {
                        ...order.export_for_printing(),
                        isBill: this.isBill,
                    },
                    formatCurrency: this.env.utils.formatCurrency,
                });
            }

            if (!receiptEl) {
                throw new Error(_t("Receipt element could not be found or rendered."));
            }

            const dataUrl = await toJpeg(receiptEl, {
                skipFonts: true,
                backgroundColor: "#ffffff",
                pixelRatio: 2,
                quality: 0.95,
            });
            const imageBase64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");

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
                throw new Error(_t("Could not synchronize order ID to send to network printer."));
            }

            const printType = this.isBill ? "bill" : (order.is_to_invoice?.() ? "invoice" : "first_print");
            const result = await this.orm.call(
                "pos.order",
                "print_network_receipt_from_ui",
                [serverOrderId || 0, imageBase64, this.pos.config.network_printer_id?.[0], printType]
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
