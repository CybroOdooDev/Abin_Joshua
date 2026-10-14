/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ReprintReceiptButton } from "@point_of_sale/app/screens/ticket_screen/reprint_receipt_button/reprint_receipt_button";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { toJpeg } from "@point_of_sale/app/utils/html-to-image";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

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

        try {
            // First attempt: Reprint the exact preserved snapshot from pos.printed.ticket
            if (serverId && typeof serverId === "number") {
                try {
                    const reprintResult = await this.orm.call(
                        "pos.order",
                        "action_reprint_ticket",
                        [[serverId]]
                    );
                    if (reprintResult) {
                        this.notification.add(
                            _t("Original ticket reprinted via network printer."),
                            { type: "success" }
                        );
                        return;
                    }
                } catch (e) {
                    console.info("No prior snapshot found, rendering new image to print", e);
                }
            }

            // Fallback: If no prior snapshot exists, render the receipt now and print
            let receiptEl = document.querySelector(".pos-receipt");
            if (!receiptEl && this.renderer) {
                receiptEl = await this.renderer.toHtml(OrderReceipt, {
                    data: order.export_for_printing(),
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

            if (serverId && typeof serverId === "number") {
                const res = await this.orm.call(
                    "pos.order",
                    "print_network_receipt_from_ui",
                    [serverId, imageBase64, this.pos.config.network_printer_id?.[0]]
                );
                if (res.success) {
                    this.notification.add(
                        _t("Ticket printed on %s", res.printer_name || ""),
                        { type: "success" }
                    );
                    return;
                }
            }
        } catch (err) {
            console.error("Network reprint error:", err);
        }

        // If network print fails, fallback to standard behavior
        return await super.click(...arguments);
    },
});
