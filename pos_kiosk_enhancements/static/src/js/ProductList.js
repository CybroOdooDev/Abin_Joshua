/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductListPage } from "@pos_self_order/app/pages/product_list_page/product_list_page";
import { useEffect, useRef, useState } from "@odoo/owl";
import { useSelfOrder } from "@pos_self_order/app/self_order_service";
import { useService, useChildRef } from "@web/core/utils/hooks";
import { fuzzyLookup } from "@web/core/utils/search";

patch(ProductListPage.prototype, {

    setup() {

        this.selfOrder = useSelfOrder();
        this.dialog = useService("dialog");
        this.router = useService("router");
        this.productsList = useRef("productsList");
        this.categoryList = useRef("categoryList");
        this.searchInput = useRef("searchInput");
        this.currentProductCard = useChildRef();

        this.state = useState({
            search: false,
            searchInput: "",
            selectedSubCategory: null,
        });

        // Keep search input focused when search bar is toggled open.
        useEffect(
            () => {
                if (this.state.search) {
                    this.searchInput.el?.focus();
                }
            },
            () => [this.state.search]
        );

        // Scroll category nav to keep active root-category button visible.
        useEffect(
            () => {
                const category = this.selfOrder.currentCategory;
                if (!category || !this.categoryList.el) {
                    return;
                }
                const activeLink = this.categoryList.el.querySelector("a.active");
                if (activeLink) {
                    this.categoryList.el.scroll({
                        left:
                            activeLink.offsetLeft +
                            activeLink.offsetWidth / 2 -
                            this.categoryList.el.offsetWidth / 2,
                        behavior: "smooth",
                    });
                }
            },
            () => [this.selfOrder.currentCategory]
        );

        useEffect(
            () => {
                this.state.selectedSubCategory = null;
                this.scrollTo(null);
            },
            () => [this.selfOrder.currentCategory]
        );
    },

    get rootCategories() {
        return Array.from(this.selfOrder.categoryList).filter(
            (c) => !c.parent_id
        );
    },

    subCategoriesOf(parentId) {
        return Array.from(this.selfOrder.categoryList).filter(
            (c) => c.parent_id && c.parent_id[0] === parentId
        );
    },

    parentHasSubCategories(category) {
        return this.subCategoriesOf(category.id).length > 0;
    },

    get showSubCategoryGrid() {
        const current = this.selfOrder.currentCategory;
        return (
            current &&
            !this.state.selectedSubCategory &&
            this.parentHasSubCategories(current)
        );
    },

    get filteredCategories() {
        const current = this.selfOrder.currentCategory;
        if (!current) return [];

        if (this.state.selectedSubCategory) {
            return [this.state.selectedSubCategory];
        }

        return [current];
    },

    selectCategory(category) {
        this.selfOrder.currentCategory = category;
        this.state.selectedSubCategory = null;
    },

    /** Click on a subcategory tile. */
    selectSubCategory(subCategory) {
        this.state.selectedSubCategory = subCategory;
        this.scrollTo(null, { behavior: "instant" });
    },

    get globalSearchResults() {
        const term = this.state.searchInput?.trim();
        if (!term) return [];
        const results = [];
        for (const category of this.selfOrder.categoryList) {
            const products =
                this.selfOrder.productsGroupedByCategory[category.id] || [];
            const matches = fuzzyLookup(
                term,
                products,
                (product) => `${product.name} ${product.description_sale || ""}`
            );
            for (const product of matches) {
                results.push({ product, categoryName: category.name });
            }
        }
        return results;
    },

    getFilteredProducts(products) {
        return fuzzyLookup(
            this.state.searchInput,
            products,
            (product) => product.name + product.description_sale
        );
    },

    scrollTo(ref = null, { behavior = "smooth" } = {}) {
        if (!this.productsList.el) return;
        this.productsList.el.scroll({
            top: ref?.el ? ref.el.offsetTop - this.productsList.el.offsetTop : 0,
            behavior,
        });
    },
});