/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { qzPrinterService } from "./QZPrinterService";

patch(PosStore.prototype, {
    async after_load_server_data() {
        const res = await super.after_load_server_data(...arguments);
        if (this.config && this.config.enable_network_printing) {
            this.syncQZPrinters();
        }
        return res;
    },

    async syncQZPrinters() {
        try {
            await qzPrinterService.connect();
            if (window.qz && window.qz.printers) {
                const printers = await window.qz.printers.find();
                if (printers && printers.length) {
                    await this.orm.call("pos.network.printer", "register_printers", [printers]);
                    console.log("[QZ Tray] Auto-discovered local printers registered:", printers);
                }
            }
        } catch (e) {
            console.warn("[QZ Tray] Local printer sync skipped or deferred:", e);
        }
    },

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
