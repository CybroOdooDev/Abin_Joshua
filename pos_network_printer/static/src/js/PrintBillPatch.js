/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PrintBillButton } from "@pos_restaurant/app/control_buttons/print_bill_button/print_bill_button";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { toJpeg } from "@point_of_sale/app/utils/html-to-image";
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
            // Render the Pro-Forma pre-payment bill
            const receiptData = {
                ...order.export_for_printing(),
                isBill: true,
            };
            const receiptEl = await this.renderer.toHtml(OrderReceipt, {
                data: receiptData,
                formatCurrency: this.env.utils.formatCurrency,
            });

            if (!receiptEl) {
                return await super.click(...arguments);
            }

            const dataUrl = await toJpeg(receiptEl, {
                skipFonts: true,
                backgroundColor: "#ffffff",
                pixelRatio: 2,
                quality: 0.95,
            });
            const imageBase64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");

            // Fetch server order ID if synced
            const orderName = typeof order.get_name === "function" ? order.get_name() : order.name;
            const serverOrderId =
                (this.pos.validated_orders_name_server_id_map && this.pos.validated_orders_name_server_id_map[orderName]) ||
                order.server_id ||
                (typeof order.id === "number" ? order.id : 0);

            const result = await this.orm.call(
                "pos.order",
                "print_network_receipt_from_ui",
                [serverOrderId || 0, imageBase64, this.pos.config.network_printer_id?.[0], "bill"]
            );

            if (result && result.success) {
                this.notification.add(
                    _t("Pre-payment bill printed on %s", result.printer_name || ""),
                    { type: "success" }
                );
            } else {
                this.notification.add(
                    _t("Network Printer: %s", result?.message || _t("Could not print bill")),
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
