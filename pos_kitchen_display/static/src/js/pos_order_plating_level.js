/** @odoo-module **/

import { Order, Orderline } from "@point_of_sale/app/store/models";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { Orderline as OrderlineComponent } from "@point_of_sale/app/generic_components/orderline/orderline";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { PlatingLevelPopup } from "@pos_kitchen_display/js/plating_level_popup";
import { PlatingLevelSelector } from "@pos_kitchen_display/js/plating_level_selector";

// Register PlatingLevelSelector in ProductScreen components
ProductScreen.components = {
    ...ProductScreen.components,
    PlatingLevelSelector,
};

// Patch PosStore to process loaded pos.plating.level data
patch(PosStore.prototype, {
    async _processData(loadedData) {
        await super._processData(...arguments);
        this.pos_plating_level = loadedData["pos.plating.level"] || [];
        this.pos_plating_level_by_id = {};
        for (const level of this.pos_plating_level) {
            this.pos_plating_level_by_id[level.id] = level;
        }
    },
});

// Patch Orderline Model
patch(Orderline.prototype, {
    setup() {
        super.setup(...arguments);
        this.plating_level_id = this.plating_level_id || null;
    },

    export_as_JSON() {
        const json = super.export_as_JSON(...arguments);
        json.plating_level_id = this.plating_level_id || false;
        return json;
    },

    init_from_JSON(json) {
        super.init_from_JSON(...arguments);
        this.plating_level_id = json.plating_level_id || null;
    },

    get_plating_level() {
        if (!this.plating_level_id) return null;
        const levels = this.pos.pos_plating_level || [];
        return levels.find(l => l.id === this.plating_level_id) || null;
    },

    set_plating_level(levelId) {
        this.plating_level_id = levelId || null;
    },

    can_be_merged_with(orderline) {
        if (this.plating_level_id !== orderline.plating_level_id) {
            return false;
        }
        return super.can_be_merged_with(...arguments);
    },

    getDisplayData() {
        const data = super.getDisplayData(...arguments);
        data.plating_level_id = this.plating_level_id;
        data.plating_level = this.get_plating_level();
        return data;
    },
});

// Patch Order Model
patch(Order.prototype, {
    setup() {
        super.setup(...arguments);
        this.selected_plating_level_id = this.selected_plating_level_id || null;
    },

    set_orderline_options(orderline, options) {
        const res = super.set_orderline_options(...arguments);
        if (options && options.plating_level_id !== undefined) {
            orderline.set_plating_level(options.plating_level_id);
        } else if (!orderline.plating_level_id) {
            // Inherit from combo parent or use order's active course
            let levelId = options?.comboParent?.plating_level_id || this.selected_plating_level_id;
            if (!levelId && this.pos.pos_plating_level && this.pos.pos_plating_level.length) {
                const defaultRec = this.pos.pos_plating_level.find(l => l.is_default);
                levelId = defaultRec ? defaultRec.id : this.pos.pos_plating_level[0].id;
            }
            if (levelId) {
                orderline.set_plating_level(levelId);
            }
        }
        return res;
    },
});

// Patch Orderline OWL Component for line-level course change
patch(OrderlineComponent.prototype, {
    setup() {
        super.setup(...arguments);
        this.popup = useService("popup");
    },

    async changePlatingLevel(line) {
        await this.popup.add(PlatingLevelPopup, { line });
    },
});
