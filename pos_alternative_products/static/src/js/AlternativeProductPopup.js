/** @odoo-module **/
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { Component, useProps, t } from "@odoo/owl";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

export class AlternativeProductPopup extends Component {
    static template = "pos_alternative_products.AlternativeProduct";
    static components = { Dialog };
    props = useProps({
        cancelText: t.string().optional(_t("Cancel")),
        title: t.string().optional(_t("Alternative Product")),
        body: t.array().optional([]),
        close: t.function().optional(() => {}),
    });
    setup() {
        super.setup();
        this.pos = usePos();
        this.orm = useService("orm");
        this.dialog = useService("dialog");
    }
    async clickProduct(item){
        var response = await this.orm.call("stock.quant", "pos_alternative_product", [[]],{alter_id:item.id, code:item.default_code});
        const selectedAlternateProduct = this.props.body.find(obj => obj.id === item.id);
        if (response !=0){
            var product = await this.orm.call(
                "product.product", "search_read", [[['id', '=', parseInt(response)]]],
                {fields: ['id', 'name', 'list_price', 'default_code','pos_categ_ids']});
            product = product[0];
            // Check if product category is available in POS config
            const availableCategories = (this.pos.config.iface_available_categ_ids || []).map(cat => cat.id);
            const productCategories = (product.pos_categ_ids || []).map(id => parseInt(id));
            const isCategoryAllowed = availableCategories.length === 0 || productCategories.some(cat_id => availableCategories.includes(cat_id));
            if (isCategoryAllowed) {
                await this.pos.addLineToCurrentOrder({ product_tmpl_id: selectedAlternateProduct });
            } else {
                await this.dialog.add(AlertDialog, {
                    title: _t("Category Restricted"),
                    body: _t("This product belongs to a category that is not available in the POS session."),
                });
            }
        } else{
            await this.dialog.add(AlertDialog, {title: _t("Product Missing"), body: _t("Make sure that the product is available in pos.")})
        }
        this.props.close();
    }
}