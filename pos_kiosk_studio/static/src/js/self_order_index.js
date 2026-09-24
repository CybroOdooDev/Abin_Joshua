/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import SelfOrderIndexModule from "@pos_self_order/app/self_order_index";
import { useState } from "@odoo/owl";
import { useSelfOrder } from "@pos_self_order/app/self_order_service";
import { StudioSidebar } from "@pos_kiosk_studio/js/studio_sidebar";

const SelfOrderIndex = SelfOrderIndexModule.selfOrderIndex;

SelfOrderIndex.components = {
    ...SelfOrderIndex.components,
    StudioSidebar,
};

patch(SelfOrderIndex.prototype, {
    setup() {
        super.setup();
        this.selfOrder = useSelfOrder();
        this.state = useState({ showStudio: false });
    },
    get isAdmin() {
        const user = this.env.services.user;
        return !!(user.isAdmin || user.isSystem || user.userId === 1);
    },

    toggleStudio() {
        if (!this.isAdmin) return;
        this.state.showStudio = !this.state.showStudio;
        if (this.state.showStudio) {
            this.selfOrder.enableEditMode();
        } else {
            this.selfOrder.disableEditMode?.();
        }
    },
});