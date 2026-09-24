/** @odoo-module */
import { Component } from "@odoo/owl";

export class PaymentReceipt extends Component {
    static template = "agr_kiosk_pay.PaymentReceipt";
    static props = {
        data: {
            type: Object,
            shape: {
                order: {
                    type: Object,
                    shape: {
                        name: String,
                        lines: Array,
                        tax: Number,
                        total: Number,
                        payment_method: String,
                    }
                }
            }
        },
    };
}