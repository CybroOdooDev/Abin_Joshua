/** @odoo-module **/

import {AbstractAwaitablePopup} from "@point_of_sale/app/popup/abstract_awaitable_popup";
import {useService} from "@web/core/utils/hooks";
import {_t} from "@web/core/l10n/translation";

function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function round(value) {
    return Math.round(num(value) * 1000000) / 1000000;
}

export class PosScanPaymentPopup extends AbstractAwaitablePopup {
    static template = "pos_kiosk_enhancements.PosScanPaymentPopup";

    setup() {
        super.setup();
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.pos = useService("pos");
    }

    get orderLines() {
        return this.props.lines || this.props.rawLines || [];
    }

    get correctAmount() {
        const amount = Number(this.props.amount || 0);  
        return Number.isFinite(amount) ? amount : 0;
    }

    get formattedAmount() {
        return this.correctAmount.toFixed(2);
    }

    get paymentMethods() {
        return this.props.paymentMethods || [];
    }

    isCashSecurityPayment(method) {
        return Boolean(method.is_cashsecurity_payment);
    }

    isDojoPayment(method) {
        return Boolean(method.is_dojo_payment);
    }

    // Sanitizes a tax_details array (whether freshly fetched or parsed from
    // stored JSON) into the exact shape OrderReceipt expects, so a missing
    // or malformed field can never crash the receipt screen.
    _sanitizeTaxDetails(rawDetails) {
        return (Array.isArray(rawDetails) ? rawDetails : [])
            .map((line) => ({
                tax: {
                    id: line.tax?.id,
                    name: line.tax?.name,
                    amount: num(line.tax?.amount, 0),
                },
                amount: num(line.amount, 0),
                base: num(line.base, 0),
            }))
            .filter((line) => line.tax?.name);
    }

    async _applyComboTaxBreakdown(order) {
        if (!order?.is_receipt_protected) {
            return;
        }
        if (order.combo_tax_details?.length) {
            return;
        }

        const sourceOrderId = order.receipt_protected_order_id;

        // Reuse the breakdown already computed & printed at the kiosk so the
        // POS receipt matches it exactly, instead of recomputing independently.
        if (sourceOrderId) {
            try {
                const [record] = await this.orm.read(
                    "pos.order",
                    [sourceOrderId],
                    ["kiosk_tax_breakdown", "kiosk_combo_tax_amount"]
                );

                if (record?.kiosk_tax_breakdown) {
                    let parsed = [];
                    try {
                        parsed = JSON.parse(record.kiosk_tax_breakdown);
                    } catch (parseErr) {
                        console.warn("Invalid kiosk_tax_breakdown JSON", parseErr);
                    }

                    const safeDetails = this._sanitizeTaxDetails(parsed);

                    if (safeDetails.length) {
                        order.combo_tax_details = safeDetails;
                        order.combo_tax_amount = round(
                            num(record.kiosk_combo_tax_amount)
                        );
                        return;
                    }
                }
            } catch (e) {
                console.warn("Could not load stored kiosk tax breakdown, recomputing instead", e);
            }
        }

        // Fallback: orders not created at the kiosk (no stored breakdown)
        const comboTaxPayload = order._buildComboTaxPayload();
        if (!comboTaxPayload.length) {
            return;
        }

        const taxResult = await this.orm.call(
            "pos.order",
            "compute_pos_combo_tax_breakdown",
            [comboTaxPayload]
        );

        const taxDetails = this._sanitizeTaxDetails(taxResult.tax_details);
        const orderTax = round(order.get_total_tax());

        const breakdownTotal = round(
            taxDetails.reduce(
                (sum, line) => sum + line.amount,
                0
            )
        );

        if (
            breakdownTotal > 0 &&
            Math.abs(orderTax - breakdownTotal) >= 0.000001
        ) {
            const factor = orderTax / breakdownTotal;

            taxDetails.forEach((line) => {
                line.amount = round(line.amount * factor);
            });

            const scaledTotal = round(
                taxDetails.reduce(
                    (sum, line) => sum + line.amount,
                    0
                )
            );

            const diff = round(orderTax - scaledTotal);

            if (Math.abs(diff) >= 0.000001) {
                taxDetails.sort((a, b) => b.amount - a.amount);

                taxDetails[0].amount = round(
                    taxDetails[0].amount + diff
                );
            }
        }
        order.combo_tax_details = taxDetails;
        order.combo_tax_amount = round(
            taxDetails.reduce(
                (sum, line) => sum + line.amount,
                0
            )
        );
    }

    async processCashSecurityPayment(method, amount, orderId) {
        const config = this.pos.config || {};
        const baseUrl = (config.cash_security_url || "http://localhost:5001/api/main").replace(/\/$/, "");
        const isDojo = this.isDojoPayment(method);

        if (isDojo && !config.dojo_terminal_id) {
            this.notification.add(_t("Please configure the Dojo Terminal ID."), {
                type: "warning",
            });
            return false;
        }

        const payload = {
            AmountToCharge: Math.round(amount * 100),
            OperationNumber: String(orderId || Date.now()),
            CashBoxCode: String(config.cashbox_code || "01"),
            ShowOkButton: false,
            PaymentMethod: isDojo ? "Card" : "Cash",
        };

        if (isDojo) {
            payload.DojoTerminalId = config.dojo_terminal_id;
        }

        const formBody = new URLSearchParams(payload).toString();

        const response = await fetch(`${baseUrl}/charge`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formBody,
        });

        if (!response.ok) {
            throw new Error(`CashSecurity HTTP error: ${response.status}`);
        }

        const result = await response.json();

        if (!result.Success) {
            this.notification.add(result.FailedReason || _t("CashSecurity payment failed."), {
                type: "danger",
            });
            return false;
        }

        return true;
    }

    async pay(methodId) {
        const orderId = Number(this.props.orderId || 0);
        const amount = Number(this.correctAmount || 0);
        const currentSessionId = this.pos.pos_session.id;

        const method = this.paymentMethods.find((m) => m.id === methodId);

        if (!method) {
            this.notification.add(_t("Payment method not found."), {type: "danger"});
            return;
        }

        try {
            if (amount > 0) {
                if (this.isCashSecurityPayment(method)) {
                    const cashSecurityOk = await this.processCashSecurityPayment(method, amount, orderId);
                    if (!cashSecurityOk) return;
                }
            }

            await this.orm.write("pos.order", [orderId], {
                session_id: currentSessionId,
            });

            if (amount > 0) {
                await this.orm.call("pos.order", "add_payment", [
                    orderId,
                    {
                        payment_method_id: methodId,
                        amount: amount,
                        pos_order_id: orderId,
                        payment_date: new Date().toISOString().split("T")[0],
                    },
                ]);
            }
            await this.orm.call("pos.order", "action_pos_order_paid", [[orderId]]);
            this.notification.add(_t("Payment Received!"), {type: "success"});

            const fullOrders = await this.orm.call("pos.order", "export_for_ui", [[orderId]]);
            if (!fullOrders?.length) {
                this.notification.add(_t("Could not load receipt."), {type: "warning"});
                this.props.close();
                this.confirm();
                return;
            }

            const json = fullOrders[0];
            const paidOrder = this.pos.createReactiveOrder(json);
            paidOrder.kiosk_amount_total = num(json.amount_total);
            paidOrder.kiosk_amount_tax = num(json.amount_tax);
            paidOrder.state = "paid";
            paidOrder.is_receipt_protected = true;
            paidOrder.receipt_protected_order_id = orderId;

            // Rebuild combo tax breakdown for kiosk receipts
            await this._applyComboTaxBreakdown(paidOrder);

            this.props.close();
            this.confirm();
            this.pos.set_order(paidOrder);
            this.pos.showScreen("ReceiptScreen", {
                order: paidOrder,
            });
        } catch (err) {
            console.error("Payment Process Error:", err);
            this.notification.add(
                _t("Payment failed: ") + (err.data?.message || err.message),
                {type: "danger"}
            );
        }
    }
}