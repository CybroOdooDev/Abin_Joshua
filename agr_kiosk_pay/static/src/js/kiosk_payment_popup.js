/** @odoo-module */
import { Component, useState, onWillStart } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { renderToString } from "@web/core/utils/render";

export class KioskPaymentMethodPopup extends Component {
    static template = "agr_kiosk_pay.KioskPaymentMethodPopup";
    static components = {
        Dialog
    };
    static props = {
        selfOrder: Object,
        onPaymentMethodSelected: Function,
        close: Function,
    };

    setup() {
        this.state = useState({
            loading: true,
            errorMessage: null,
            processingPayment: false,
            paymentMethods: [],
            cashSecurityUrl: "http://localhost:5001/api/main",
        });
        this.notification = useService("notification");
        this.orm = useService("orm");
        this.router = useService("router");
        this.printer = useService("printer");

        onWillStart(async () => {
            try {
                const configId = this.props.selfOrder.pos_config_id;
                if (!configId) return;

                const config = await this.orm.read(
                    "pos.config",
                    [configId],
                    ["payment_method_ids", "cash_security_url"]
                );

                if (config[0]?.cash_security_url) {
                    this.state.cashSecurityUrl = config[0].cash_security_url;
                }

                const methodIds = config[0]?.payment_method_ids || [];
                const lang = this.props.selfOrder.currentLanguage.code || "es_ES";
                if (methodIds.length) {
                    this.state.paymentMethods = await this.orm.read(
                        "pos.payment.method",
                        methodIds,
                        ["id", "name", "type", "use_payment_terminal", "is_cashsecurity_payment", "is_dojo_payment"],
                        {
                            context: {
                                lang: lang,
                            },
                        }
                    );
                }
            } catch (error) {
                console.error("Setup Error:", error);
                this.state.errorMessage = _t("Could not load POS configuration.");
            } finally {
                this.state.loading = false;
            }
        });
    }
    isCashSecurity(method) {
        return Boolean(method.is_cashsecurity_payment);
    }

    isDojoPayment(method) {
        return Boolean(method.is_dojo_payment);
    }

    async _printReceipt(order, method) {
        /*
        The function is used to created the receipt
        */
        const processedLines = [];
        const products = this.props.selfOrder.products || [];

        let skipLines = 0;

        (order.lines || []).forEach((line, index) => {

            if (skipLines > 0) {
                skipLines--;
                return;
            }

            const product = products.find(p => p.id === line.product_id);
            const newLine = {
                name: line.full_product_name,
                qty: line.qty,
                price: line.price_subtotal || line.price || 0,
                components: [],
            };

            // Detect combo product
            if (product && product.isCombo) {
                let nextIndex = index + 1;
                let comboPrice = 0;

                while (nextIndex < order.lines.length) {

                    const nextLine = order.lines[nextIndex];

                    // Only lines with combo_id belong to the combo
                    if (!nextLine.combo_id) {
                        break;
                    }

                    newLine.components.push({
                        name: nextLine.full_product_name
                    });

                    // Add component price to combo price
                    comboPrice += nextLine.price_subtotal || nextLine.price || 0;

                    skipLines++;
                    nextIndex++;
                }

                // Assign calculated combo price
                newLine.price = comboPrice;
            }

            processedLines.push(newLine);

        });

        const receiptData = {
            order: {
                name: order.name || order.id,
                lines: processedLines,
                tax: order.amount_tax || 0,
                total: order.amount_total || 0,
                payment_method: method.name,
            },
        };

         // --- NEW LOCAL PRINTING LOGIC ---
        await this._printWithQZ(receiptData);
    }

    async _printWithQZ(receiptData) {
        const pos_config = this.props.selfOrder.config;
        try {
            const templateName = "agr_kiosk_pay.PaymentReceipt";

            // ✅ Convert component → HTML string (NOT element)
            const receiptHtml = renderToString(templateName, {
                data: receiptData
            });

            // ✅ Ensure QZ is connected
            if (!qz.websocket.isActive()) {
                await qz.websocket.connect();
            }

            // ✅ Get printer name (must match system exactly)
            const printerName = pos_config.printer_name;

            const config = qz.configs.create(printerName);

            // ✅ Send RAW HTML string (NOT element)
            const data = [{
                type: 'html',
                format: 'plain',
                data: receiptHtml
            }];

            await qz.print(config, data);

        } catch (error) {
            console.error("❌ QZ Printing failed:", error);
        }
    }

    get dialogTitle() {
    return _t("How would you like to pay?");
}


    get availablePaymentMethods() {
        /*
        The function is used to get the all the payment methods
        */
        return this.state.paymentMethods || [];
    }

    async selectPaymentMethod(method) {
        /*
        The function is used to select the available payment methods.
        */
        if (this.state.processingPayment) return;

        const selfOrder = this.props.selfOrder;
        const order = selfOrder.currentOrder;

        if (this.isCashSecurity(method)) {
            await this._processCashSecurity(method);
        } else {
            try {
                await this._printReceipt(order, method);
            } catch (err) {
                console.error("Receipt print failed:", err);
            }
            this.props.close();
            this.props.onPaymentMethodSelected(method);
        }
    }

    async _processCashSecurity(method) {
        /*
        In this function it will process the integration through Cash Security,
         using the values that we passed in the payload.
        */
        this.state.processingPayment = true;
        this.state.errorMessage = null;

        const selfOrder = this.props.selfOrder;
        const order = selfOrder.currentOrder;
        const totalCents = Math.round((order.amount_total || 0) * 100);
        const isDojo = this.isDojoPayment(method);
        if (isDojo && !selfOrder.config?.dojo_terminal_id) {
            this.notification.add(_t("Please configure the Dojo Terminal ID!"), {
                type: "warning"
            });
            this.state.processingPayment = false;
            return;
        }

        const payload = {
            AmountToCharge: totalCents,
            OperationNumber: String(order.id || order.uuid || Date.now()),
            CashBoxCode: String(selfOrder.pos_config_id || "01"),
            ShowOkButton: false,
            PaymentMethod: isDojo ? "Card" : "Cash",
        };

        if (isDojo && selfOrder.config?.dojo_terminal_id) {
            payload.DojoTerminalId = selfOrder.config.dojo_terminal_id;
        }

        const baseUrl = this.state.cashSecurityUrl.replace(/\/$/, "");

        try {
            const formBody = new URLSearchParams(payload).toString();
            const response = await fetch(`${baseUrl}/charge`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: formBody,
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();
            if (result.Success) {
                await this._finalizeOrder(order, method, selfOrder);
            } else {
                this.state.errorMessage = result.FailedReason || _t("Transaction failed.");
                this.state.processingPayment = false;
            }
        } catch (error) {
            console.error("Fetch Error:", error);
            this.state.errorMessage = _t("Connection Error: Is the Cashbox software running on this machine?");
            this.state.processingPayment = false;
        }
    }

    async _finalizeOrder(order, method, selfOrder) {
        /*
        The function is used to finalize the order, after receiving success from the Cash security,
        The order in the pos moved to paid state, and the corresponding payment is created.
        */
        try {
            const amount = order.amount_total || 0;

            if (typeof selfOrder.sendDraftOrderToServer === "function") {
                await selfOrder.sendDraftOrderToServer();
            } else if (typeof order.save_to_db === "function") {
                await order.save_to_db();
            }

            const serverOrderId = order.id;
            if (!serverOrderId) {
                throw new Error(_t("Order has no server ID after sync."));
            }

            await this.orm.call("pos.order", "add_payment", [
                serverOrderId,
                {
                    payment_method_id: method.id,
                    amount: amount,
                    pos_order_id: order.id,
                },
            ]);

            await this.orm.call("pos.order", "action_pos_order_paid", [
                [serverOrderId]
            ]);
            await this._printReceipt(order, method);
            this.notification.add(_t("Payment Received!"), {
                type: "success"
            });
            this.props.close();
            this.props.onPaymentMethodSelected(method);
            if (typeof selfOrder.router?.navigate === "function") {
                selfOrder.router.navigate("default");
            } else if (typeof selfOrder.navigate === "function") {
                selfOrder.navigate("default");
            }
        } catch (err) {
            console.error("Finalize order error:", err);
            this.state.errorMessage = _t("Payment was received but the order could not be confirmed: ") + err.message;
            this.state.processingPayment = false;
        }
    }

    async onCancel() {
        /*
        The function is used to cancel the payment in CashSecurity
        */
        if (this.state.processingPayment) {
            try {
                const baseUrl = this.state.cashSecurityUrl.replace(/\/$/, "");
                await fetch(`${baseUrl}/Cancel`, {
                    method: "POST",
                    credentials: "omit"
                });
            } catch (e) {
                console.error("Cancel failed", e);
            }
            this.state.processingPayment = false;
        }
        this.props.close();
    }
}