/** @odoo-module **/

import { Component } from "@odoo/owl";

export class CashClosingReceipt extends Component {
    static template = "pos_network_printer.CashClosingReceipt";
    static props = {
        data: { type: Object },
        formatCurrency: { type: Function },
        currentDate: { type: String, optional: true },
    };
}
