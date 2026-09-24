/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ComboPage } from "@pos_self_order/app/pages/combo_page/combo_page";

patch(ComboPage.prototype, {

    onStepClick(comboId) {
        const comboIds = this.props.product.pos_combo_ids;
        const index = comboIds.indexOf(comboId);

        const currentIndex = this.state.currentComboIndex;

        // Only allow going backward
        if (index < currentIndex) {

            // ✅ 1. Trim future selections
            this.state.selectedCombos = this.state.selectedCombos.slice(0, index);

            // ✅ 2. Move pointer
            this.state.currentComboIndex = index;

            // ❗ DO NOT manually set selectedProduct
            // ❗ DO NOT force UI

            // ✅ 3. Reset only minimal UI flags
            this.state.selectedProduct = null;
            this.state.showQtyButtons = false;
            this.state.showResume = false;
        }
    },

});