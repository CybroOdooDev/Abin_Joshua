/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ConfirmationPage } from "@pos_self_order/app/pages/confirmation_page/confirmation_page";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { toJpeg } from "@point_of_sale/app/utils/html-to-image";
import { loadAllImages } from "@point_of_sale/utils";
import { useService } from "@web/core/utils/hooks";
import { onMounted } from "@odoo/owl";

patch(ConfirmationPage.prototype, {
    setup() {
        super.setup(...arguments);
        this.renderer = useService("renderer");

        onMounted(() => {
            // Auto-print receipt upon reaching the kiosk ConfirmationPage
            if (this.selfOrder.config.enable_network_printing && this.selfOrder.config.auto_print_on_payment) {
                this.printKioskNetworkReceipt();
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

            let imageBase64 = null;
            if (this.renderer && this.renderer.whenMounted) {
                imageBase64 = await this.renderer.whenMounted({
                    el: receiptEl,
                    callback: async (mountedEl) => {
                        mountedEl.classList.add("pos-receipt-print");
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
                wrapper.style.width = "380px";
                wrapper.style.opacity = "0";
                wrapper.style.pointerEvents = "none";
                receiptEl.classList.add("pos-receipt-print");
                wrapper.appendChild(receiptEl);
                (document.querySelector(".pos-receipt-container") || document.body).appendChild(wrapper);
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
                throw new Error("Failed to capture kiosk receipt image.");
            }

            // Dispatch to network printer via public Kiosk controller
            const result = await this.selfOrder.rpc("/pos/kiosk-print-receipt", {
                order_id: order.id,
                access_token: order.access_token,
                image_base64: imageBase64,
            });

            if (result && result.success) {
                order._network_printed = true;
                console.info("[Kiosk Network Printer] Auto-printed ticket successfully on", result.printer_name);
            } else {
                console.warn("[Kiosk Network Printer] Auto-print ticket failed:", (result && result.message) || "");
            }
        } catch (err) {
            console.error("[Kiosk Network Printer] Error during kiosk ticket auto-print:", err);
        }
    },
});
