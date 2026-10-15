/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ConfirmationPage } from "@pos_self_order/app/pages/confirmation_page/confirmation_page";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { toJpeg } from "@point_of_sale/app/utils/html-to-image";
import { useService } from "@web/core/utils/hooks";
import { onMounted } from "@odoo/owl";

patch(ConfirmationPage.prototype, {
    setup() {
        super.setup(...arguments);
        this.renderer = useService("renderer");

        onMounted(() => {
            const config = this.selfOrder?.config || {};
            const autoPrint = config.auto_print_on_payment !== false;
            if (
                config.self_ordering_mode === "kiosk" &&
                config.enable_network_printing &&
                autoPrint
            ) {
                // Execute auto-print to the local network thermal printer
                setTimeout(() => {
                    this.printKioskNetworkReceipt();
                }, 600);
            }
        });
    },

    async printKioskNetworkReceipt() {
        const order = this.confirmedOrder;
        if (!order || order._network_printed) {
            return;
        }

        try {
            console.info("[Kiosk Network Printer] Starting auto-print for order:", order.trackingNumber || order.pos_reference || order.id);

            // Render the receipt component to an in-memory DOM element
            const receiptData = this.selfOrder.export_for_printing(order);
            const receiptEl = await this.renderer.toHtml(OrderReceipt, {
                data: receiptData,
                formatCurrency: this.selfOrder.formatMonetary,
            });

            if (!receiptEl) {
                console.warn("[Kiosk Network Printer] Could not render receipt HTML.");
                return;
            }

            // Convert to high-contrast monochrome-ready JPEG without remote font download 404s
            const dataUrl = await toJpeg(receiptEl, {
                skipFonts: true,
                backgroundColor: "#ffffff",
                pixelRatio: 2,
                quality: 0.95,
            });
            const imageBase64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");

            // Dispatch to network printer via public Kiosk controller
            const result = await this.selfOrder.rpc("/pos/kiosk-print-receipt", {
                order_id: order.id,
                access_token: order.access_token,
                image_base64: imageBase64,
                config_id: this.selfOrder.pos_config_id || this.selfOrder.config?.id,
            });

            if (result && result.success) {
                order._network_printed = true;
                console.info("[Kiosk Network Printer] Receipt successfully dispatched to printer:", result.printer_name);
            } else {
                console.warn("[Kiosk Network Printer] Printing failed:", result?.message);
            }
        } catch (err) {
            console.error("[Kiosk Network Printer] Error during kiosk print:", err);
        }
    },
});
