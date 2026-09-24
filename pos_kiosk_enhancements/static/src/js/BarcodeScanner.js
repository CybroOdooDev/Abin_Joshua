/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { BarcodeReader } from "@point_of_sale/app/barcode/barcode_reader_service";
import { PosScanPaymentPopup } from "@pos_kiosk_enhancements/js/PosScanPaymentPopup";
import { _t } from "@web/core/l10n/translation";

patch(BarcodeReader.prototype, {
    async _scan(code) {
        const pos = this.hardwareProxy?.pos;
        if (!code || !pos) {
            return super._scan(...arguments);
        }

        const notification = pos.env.services.notification;
        const orm = pos.env.services.orm;
        const ref = code.trim().replace(/\r|\n/g, "").replace(/'/g, "-");

        try {
            const orders = await orm.searchRead(
                "pos.order",
                [
                    ["pos_reference", "=", ref],
                    ["state", "=", "draft"],
                ],
                ["id", "tracking_number", "state", "pos_reference", "amount_total", "amount_tax"]
            );

            const paidOrders = await orm.searchRead(
                "pos.order",
                [
                    ["pos_reference", "=", ref],
                    ["state", "in", ["paid", "invoiced", "posted"]],
                ],
                ["id", "tracking_number", "state", "pos_reference"]
            );

            if (paidOrders.length) {
                notification.add(_t("Order already paid"), { type: "warning" });
                return;
            }

            if (!orders.length) {
                notification.add(_t("Order not found: ") + ref, { type: "warning" });
                return;
            }

            const orderData = orders[0];
            const fullOrders = await orm.call("pos.order", "export_for_ui", [[orderData.id]]);

            if (!fullOrders.length) {
                notification.add(_t("Failed to fetch order"), { type: "danger" });
                return;
            }

            const json = fullOrders[0];

            const configMethodIds = pos.config.payment_method_ids || [];
            const paymentMethods = pos.payment_methods.filter(
                (m) => configMethodIds.includes(m.id) && (m.type === "cash" || m.type === "bank")
            );

            const currentScreen = pos.mainScreen.component.name;
            const isProductScreen = currentScreen === "ProductScreen";

            if (isProductScreen) {
                const order = pos.createReactiveOrder(json);
                // Protect scanned kiosk/receipt order from accidental product deletion.
                // Deletion is blocked in ReceiptProtectedOrderline.js.
                order.is_receipt_protected = true;
                order.receipt_protected_order_id = orderData.id;
                order.receipt_protected_order_name = json.name || orderData.pos_reference;

                pos.get_order_list().push(order);
                pos.set_order(order);

                order.orderlines.forEach((line) => {
                    line.set_quantity(line.get_quantity());
                });

                const lines = order.orderlines
                    .filter((line) => !line.combo_parent_id)
                    .map((line) => ({
                        name: line.get_product().display_name,
                        qty: line.get_quantity(),
                        price: Number(line.price || 0),
                        isCombo: !!(line.comboLines && line.comboLines.length),
                        children: (line.comboLines || []).map((child) => ({
                            name: child.get_product().display_name,
                            qty: child.get_quantity(),
                            price: Number(child.price_subtotal_incl || child.price_subtotal || 0),
                        })),
                    }));
                this.popup.add(PosScanPaymentPopup, {
                    orderId: Number(orderData.id),
                    orderName: json.name || orderData.pos_reference,
                    amount: Number(orderData.amount_total || json.amount_total || 0),
                    tax: correctTax,
                    customer: json.partner_id?.[1] || "",
                    tracking_number: json.tracking_number || orderData.tracking_number,
                    lines,
                    posOrder: tempOrder,
                    paymentMethods: paymentMethods.map((m) => ({
                        id: m.id,
                        name: m.name,
                        type: m.type,
                        is_cashsecurity_payment: m.is_cashsecurity_payment,
                        is_dojo_payment: m.is_dojo_payment,
                    })),
                });

                return;
            }

            const jsonLines = (json.lines || []).map((line) => line[2] || line);
            const posProducts = pos.db?.product_by_id || {};
            const correctTax = Number(json.amount_tax || orderData.amount_tax || 0);

            let lines = [];

            try {
                const tempOrder = pos.createReactiveOrder(json);

                tempOrder.orderlines.forEach((line) => {
                    if (line.combo_parent_id) {
                        return;
                    }

                    const product = line.get_product();
                    const isCombo = !!(line.comboLines && line.comboLines.length);

                    if (isCombo) {
                        const dbProduct = posProducts[product.id];
                        const parentPrice = dbProduct?.lst_price || line.price || 0;

                        lines.push({
                            name: product.display_name,
                            qty: line.get_quantity(),
                            price: parentPrice,
                            isCombo: true,
                            children: line.comboLines.map((child) => {
                                const childProductId = child.get_product().id;
                                const jsonChild = jsonLines.find(
                                    (ld) =>
                                        ld.product_id === childProductId &&
                                        (ld.combo_parent_uuid || ld.combo_parent_id)
                                );

                                return {
                                    name: child.get_product().display_name,
                                    qty: child.get_quantity(),
                                    price: Number(
                                        jsonChild?.price_subtotal_incl ??
                                            jsonChild?.price_subtotal ??
                                            child.price_subtotal_incl ??
                                            child.price_subtotal ??
                                            0
                                    ),
                                };
                            }),
                        });
                    } else {
                        lines.push({
                            name: product.display_name,
                            qty: line.get_quantity(),
                            price: line.price,
                            isCombo: false,
                        });
                    }
                });
            } catch (e) {
                console.warn("Fallback line parsing", e);

                lines = jsonLines
                    .filter((ld) => !(ld.combo_parent_uuid || ld.combo_parent_id))
                    .map((ld) => ({
                        name: ld.full_product_name || ld.name || "Unknown Product",
                        qty: ld.qty || 0,
                        price: ld.price_subtotal_incl || ld.price_unit || 0,
                        isCombo: false,
                    }));
            }

            this.popup.add(PosScanPaymentPopup, {
                orderId: Number(orderData.id),
                orderName: json.name || orderData.pos_reference,
                amount: Number(orderData.amount_total || json.amount_total || 0),
                tax: correctTax,
                customer: json.partner_id?.[1] || "",
                tracking_number: json.tracking_number || orderData.tracking_number,
                lines,
                paymentMethods: paymentMethods.map((m) => ({
                    id: m.id,
                    name: m.name,
                    type: m.type,
                    is_cashsecurity_payment:m.is_cashsecurity_payment,
                    is_dojo_payment:m.is_dojo_payment
                })),
            });
        } catch (err) {
            console.error("SCAN ERROR:", err);
            notification.add(_t("Unexpected error"), { type: "danger" });
        }
    },
});
