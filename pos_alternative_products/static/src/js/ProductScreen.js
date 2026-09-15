/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { AlternativeProductPopup } from "@pos_alternative_products/js/AlternativeProductPopup";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { _t } from "@web/core/l10n/translation";

patch(ProductScreen.prototype, {
    setup() {
        super.setup();
        this.orm = useService("orm");
    },

    async addProductToOrder(product) {
        const alternativeIds = product.raw?.alternative_product_ids || product.alternative_product_ids || [];
        let matchedProducts = [];
        if (this.pos.models?.["product.template"]) {
            matchedProducts = alternativeIds
                .map((id) => this.pos.models["product.template"].get(Number(id)))
                .filter(Boolean);
        } else {
            const productsToDisplay = this.env.services.pos.productsToDisplay || [];
            matchedProducts = productsToDisplay.filter((p) =>
                alternativeIds.includes(p.raw?.id ?? p.id)
            );
        }

        for (let i = 0; i < matchedProducts.length; i++) {
            matchedProducts[i]["image_url"] = window.location.origin + "/web/image/product.template/" + matchedProducts[i].id + "/image_128";
        }

        const qty = product.raw?.qty_available ?? product.qty_available ?? 0;
        if (matchedProducts.length > 0 && qty <= 0) {
            this.dialog.add(AlternativeProductPopup, {
                title: _t("Alternative Product"),
                cancelText: _t("Cancel"),
                body: matchedProducts,
            });
            return;
        }

        return super.addProductToOrder(...arguments);
    },
});