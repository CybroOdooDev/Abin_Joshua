/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { reportService } from "@point_of_sale/app/utils/report_service";

patch(reportService, {
    start(env, { rpc, user, ui, orm, pos }) {
        const res = super.start(...arguments);
        const originalDoAction = res.doAction;
        res.doAction = async function (reportXmlId, active_ids) {
            // When network/thermal printing is enabled, route POS invoice downloads to the 80mm ticket layout
            if (reportXmlId === "account.account_invoices" && pos?.config?.enable_network_printing) {
                return originalDoAction.call(
                    this,
                    "pos_network_printer.report_invoice_ticket_80mm",
                    active_ids
                );
            }
            return originalDoAction.apply(this, arguments);
        };
        return res;
    },
});
