/** @odoo-module **/

import { Component } from "@odoo/owl";

export class KitchenOrderReceipt extends Component {
    static template = "pos_network_printer.KitchenOrderReceipt";
    static props = {
        data: { type: Object },
    };
}
