/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { SelfOrder } from "@pos_self_order/app/self_order_service";

function getCurrentHourFloat() {
const now = new Date();
const floatHour = now.getHours() + now.getMinutes() / 60;
return floatHour;
}

patch(SelfOrder.prototype, {
initKioskData() {

    super.initKioskData(...arguments);

    const config = this.config;

    // ⭐ 24 HOURS MODE
    if (config.kiosk_no_time_limit) {
        this.ordering = true;
        this.pos_session = true;
        return;
    }

    // ⭐ SCHEDULE MODE
    if (config.kiosk_use_schedule) {

        const now = getCurrentHourFloat();
        const from = config.kiosk_open_from;
        const to = config.kiosk_open_to;

        let inside;

        if (from < to) {
            inside = now >= from && now <= to;
        } else {
            inside = now >= from || now <= to;
        }

        if (!inside) {
            this.ordering = false;
            this.pos_session = false;
        }
        else{
            this.ordering = true;
            this.pos_session = true;
        }
    }
},

});
