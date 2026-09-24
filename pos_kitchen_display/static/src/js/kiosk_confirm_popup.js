/** @odoo-module **/

import { Component } from "@odoo/owl";

export class KioskConfirmPopup extends Component {
    static template = "pos_self_order.KioskConfirmPopup";
    static props = {
        title: String,
        confirm: Function,
        cancel: Function,
        close: { type: Function, optional: true },
    };

    onConfirm() {
        this.props.close();
        this.props.confirm();
    }

    onCancel() {
        this.props.close();
        this.props.cancel();
    }
}