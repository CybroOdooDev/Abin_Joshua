/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Order, Orderline } from "@point_of_sale/app/store/models";
import { _t } from "@web/core/l10n/translation";

patch(Orderline.prototype, {
    getPriceString() {
        if (this.get_discount_str() === "100") {
            return _t("Free");
        }
        const displayPrice = this.get_display_price();
        // If combo parent has 0 display price, omit it; otherwise always display the combo base price
        if (this.comboLines && this.comboLines.length > 0 && displayPrice === 0) {
            return "";
        }
        return this.env.utils.formatCurrency(displayPrice, this.currency);
    },
});

patch(Order.prototype, {
    export_for_printing() {
        const res = super.export_for_printing(...arguments);
        const partner = this.get_partner();
        res.is_to_invoice = Boolean(
            (typeof this.is_to_invoice === "function" ? this.is_to_invoice() : this.to_invoice) ||
            this.account_move ||
            this.account_move_name ||
            this.state === "invoiced"
        );

        if (partner) {
            const addrParts = [partner.street, partner.street2, partner.zip, partner.city].filter(Boolean);
            res.partner = {
                name: partner.name,
                vat: partner.vat || "",
                phone: partner.phone || partner.mobile || "",
                email: partner.email || "",
                street: partner.street || "",
                city: partner.city || "",
                zip: partner.zip || "",
                address: addrParts.join(", "),
                labels: {
                    header: _t("Customer Details:"),
                    customer: _t("Customer:"),
                    vat: _t("VAT:"),
                    phone: _t("Phone:"),
                    email: _t("Email:"),
                    address: _t("Address:"),
                },
            };
        } else {
            res.partner = null;
        }

        // Invoice reference if available
        res.invoice_number = this.account_move_name || (this.account_move && this.account_move.name) || (typeof this.account_move === "string" ? this.account_move : null);

        return res;
    },
});
