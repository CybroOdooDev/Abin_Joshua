/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { EditBar } from "@pos_restaurant/app/floor_screen/edit_bar";

patch(EditBar, {
    props: {
        ...EditBar.props,
        addDecor: { type: Function, optional: true },
        customizeTable: { type: Function, optional: true },
    },
});

patch(EditBar.prototype, {
    isShapeChangeDisabled() {
        if (!this.props.selectedTables || this.props.selectedTables.length === 0) {
            return true;
        }
        return this.props.selectedTables.some(
            (table) =>
                table.is_decoration ||
                table.decor_preset_id ||
                table.custom_image ||
                table.image_url
        );
    },

    onChangeToCircle() {
        if (this.isShapeChangeDisabled()) return;
        this.props.changeToCircle();
    },

    onChangeToSquare() {
        if (this.isShapeChangeDisabled()) return;
        this.props.changeToSquare();
    },
});
