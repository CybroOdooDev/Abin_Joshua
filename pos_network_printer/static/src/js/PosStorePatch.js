/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";

patch(PosStore.prototype, {
    async push_single_order(order) {
        const res = await super.push_single_order(...arguments);
        if (res && res.length && order) {
            order.server_id = res[0].id;
            if (res[0].account_move_name) {
                order.account_move_name = res[0].account_move_name;
            }
            if (res[0].account_move) {
                order.account_move = res[0].account_move;
            }
        }
        return res;
    },
});
