/** @odoo-module **/
import {Order} from "@point_of_sale/app/store/models";
import {patch} from "@web/core/utils/patch";
import {ErrorPopup} from "@point_of_sale/app/errors/popups/error_popup";
import {_t} from "@web/core/l10n/translation";

function round(value) {
    return Math.round((Number(value) || 0) * 1000000) / 1000000;
}

function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

patch(Order.prototype, {
    setup() {
        super.setup(...arguments);
        this.combo_tax_details = []
        this.combo_tax_amount = 0;
        this.kiosk_amount_total = null;
        this.kiosk_amount_tax = null;
    },
    export_as_JSON() {
        const json = super.export_as_JSON(...arguments);
        json.combo_tax_details = this.combo_tax_details || [];
        json.combo_tax_amount = this.combo_tax_amount || 0;
        json.kiosk_amount_total = this.kiosk_amount_total;
        json.kiosk_amount_tax = this.kiosk_amount_tax;
        return json;
    },
    init_from_JSON(json) {
        super.init_from_JSON(...arguments);
        this.combo_tax_details = json.combo_tax_details || [];
        this.combo_tax_amount = json.combo_tax_amount || 0;
        this.kiosk_amount_total = json.kiosk_amount_total;
        this.kiosk_amount_tax = json.kiosk_amount_tax;
    },
    _getParentComboPrice(orderline) {
        return round(
            num(orderline.get_unit_price()) *
            num(orderline.get_quantity())
        );
    },
    _getReferencePrice(product) {
        return num(product.get_display_price());
    },
    _computePosComboChildren(children) {
        const result = [];
        const remainingFreeByChoice = {};

        for (const line of children) {

            const comboId = Array.isArray(line.comboLine?.combo_id)
                ? line.comboLine.combo_id[0]
                : line.comboLine?.combo_id;

            const combo =
                this.pos.db.combo_by_id?.[comboId];

            const choiceId = combo?.id || line.comboLine?.id;

            if (!(choiceId in remainingFreeByChoice)) {
                remainingFreeByChoice[choiceId] =
                    num(combo?.free_limit || 0);
            }

            const qty = combo?.allow_quantity
                ? num(line.selected_qty || 1)
                : 1;

            const unitPrice = num(line.combo_price || 0);

            let freeQty = 0;
            let paidQty = qty;

            if (remainingFreeByChoice[choiceId] > 0) {

                freeQty = Math.min(
                    qty,
                    remainingFreeByChoice[choiceId]
                );

                paidQty = Math.max(qty - freeQty, 0);

                remainingFreeByChoice[choiceId] -= freeQty;
            }
            result.push({
                line,
                freeQty,
                paidQty,
                totalQty: qty,
                unitPrice,
                price: round(paidQty * unitPrice),
            });
        }
        return result;
    },
    _buildComboTaxPayload() {
        const payload = [];

        const allOrderlines = this.get_orderlines();

        const comboParents = allOrderlines.filter(
            (ol) =>
                !ol.comboParent &&
                allOrderlines.some((l) => l.comboParent === ol)
        );

        for (const parentOl of comboParents) {
            const children = allOrderlines.filter(
                (ol) => ol.comboParent === parentOl
            );
            const comboPrice = this._getParentComboPrice(parentOl);
            const computedChildren = this._computePosComboChildren(children);
            const refs = computedChildren.map((child) => ({
                child,
                reference:
                    this._getReferencePrice(
                        child.line.product
                    ) * num(child.totalQty || 1),
            }));
            const totalReference = refs.reduce(
                (sum, item) => sum + item.reference,
                0
            );
            for (const item of refs) {
                const allocatedAmount =
                    totalReference > 0
                        ? comboPrice *
                        (item.reference / totalReference)
                        : 0;
                const extraAmount = num(item.child.price);
                payload.push({
                    product_id: item.child.line.product.id,
                    quantity: 1,
                    price_unit: round(
                        allocatedAmount + extraAmount
                    ),
                    tax_ids: item.child.line.get_applicable_taxes(),
                });
            }
        }
        return payload;
    },
    async add_product(product, options) {
        if (this.is_receipt_protected) {
            await this.pos.popup.add(ErrorPopup, {
                title: _t("Receipt Already Created"),
                body: _t(
                    "This order is locked because a receipt has already been created. You cannot add products or modify existing lines."
                ),
            });
            return;
        }
        return super.add_product(product, options);
    },

    compute_child_lines(comboParentProduct, comboLines, pricelist) {
        const result = [];
        for (const comboLine of comboLines) {
            const attribute_value_ids = comboLine.configuration?.attribute_value_ids;
            const attributesPriceExtra =
                (attribute_value_ids || [])
                    .map(
                        id =>
                            this.pos.db.attribute_value_by_id[id]
                                ?.price_extra || 0
                    )
                    .reduce((a, b) => a + b, 0);
            const comboId = Array.isArray(comboLine.combo_id)
                ? comboLine.combo_id[0]
                : comboLine.combo_id;
            const comboRecord = this.pos.db.combo_by_id?.[comboId] || {};
            const selectedQty = comboLine.quantity || 1;
            const paidQty = comboLine.paid_qty || 0;
            const pricePerUnit = (comboLine.combo_price || 0) + attributesPriceExtra;
            const isTopping = comboRecord.allow_quantity || (comboLine.extra_price || 0) > 0 || (comboLine.combo_price || 0) > 0;
            const lineQuantity = isTopping ? paidQty : selectedQty;
            result.push({
                comboLine,
                attribute_value_ids,
                price: pricePerUnit,
                quantity: lineQuantity,          // actual charged/saved qty
                selected_qty: selectedQty,
                free_qty: comboLine.free_qty || 0,
                paid_qty: paidQty,
                combo_price: comboLine.combo_price || 0,
                extra_price: comboLine.extra_price || 0,
                allow_quantity: comboRecord.allow_quantity || false,
                free_limit: comboRecord.allow_quantity || 0
            });
        }
        return result;
    },
    async addComboLines(comboParent, options) {
        if (comboParent) {
            const parentProduct = comboParent.product;
            const parentPrice = parentProduct.get_price(
                this.pos.selectedPricelist,
                1
            );
            comboParent.set_unit_price(parentPrice);
            comboParent.price_type = "automatic";
        }
        const comboLinesPrices = this.compute_child_lines(
            comboParent.product,
            options.comboLines,
            this.pricelist
        );
        for (const line of comboLinesPrices) {
            const product = this.pos.db.product_by_id[line.comboLine.product_id[0]];
            const initialQty = (line.allow_quantity || line.extra_price > 0 || line.combo_price > 0)
                ? line.paid_qty
                : (line.selected_qty || 1);
            await this.pos.addProductFromUi(product, {
                quantity: initialQty,
                price: line.price,
                comboParent,
                comboLine: line.comboLine,
                attribute_value_ids: line.attribute_value_ids,
                extras: {
                    price_type: "manual",
                },
            });
            const orderline = this.get_selected_orderline();
            orderline.selected_qty = line.selected_qty || initialQty;
            orderline.free_qty = line.free_qty;
            orderline.paid_qty = line.paid_qty;
            orderline.combo_price = line.combo_price;
            orderline.extra_price = line.extra_price;
            orderline.allow_quantity = line.allow_quantity;
        }
    },
    set_orderline_options(orderline, options) {
        if (options.comboLines?.length) {
            orderline.comboLines = [];
        }
        const result = super.set_orderline_options(orderline, options);
        // NEW: carry the kiosk/combo pricing metadata through whenever it's
        // present on options. addComboLines() already re-sets these
        // explicitly after add_product(), but the refund flow
        // (ticket_screen._prepareRefundOrderlineOptions) creates lines via a
        // plain add_product(product, options) call, so this is the only
        // place those fields get onto a refund orderline.
        if (options.combo_price !== undefined) {
            orderline.combo_price = options.combo_price;
        }
        if (options.paid_qty !== undefined) {
            orderline.paid_qty = options.paid_qty;
        }
        if (options.free_qty !== undefined) {
            orderline.free_qty = options.free_qty;
        }
        if (options.selected_qty !== undefined) {
            orderline.selected_qty = options.selected_qty;
        }
        if (options.extra_price !== undefined) {
            orderline.extra_price = options.extra_price;
        }
        if (options.allow_quantity !== undefined) {
            orderline.allow_quantity = options.allow_quantity;
        }
        return result;
    },
    set_pricelist(pricelist) {
        var self = this;
        this.pricelist = pricelist;

        const orderlines = this.get_orderlines();

        const lines_to_recompute = orderlines.filter(
            (line) =>
                line.price_type === "original" && !(line.comboLines?.length || line.comboParent)
        );
        lines_to_recompute.forEach((line) => {
            if (line.is_lot_tracked()) {
                let related_lines = [];
                const price = line.product.get_price(
                    self.pricelist,
                    line.get_quantity(),
                    line.get_price_extra(),
                    false,
                    line,
                    related_lines
                );
                related_lines.forEach((line) => line.set_unit_price(price));
            } else {
                line.set_unit_price(
                    line.product.get_price(
                        self.pricelist,
                        line.get_quantity(),
                        line.get_price_extra(),
                        false
                    )
                );
            }
            self.fix_tax_included_price(line);
        });

        const combo_parent_lines = orderlines.filter(
            (line) => line.price_type === "original" && line.comboLines?.length
        );
        const attributes_prices = {};
        combo_parent_lines.forEach((parentLine) => {
            attributes_prices[parentLine.id] = this.compute_child_lines(
                parentLine.product,
                parentLine.comboLines.map((childLine) => {
                    const comboLineCopy = { ...(childLine.comboLine || {}) };
                    if (childLine.attribute_value_ids) {
                        comboLineCopy.configuration = {
                            attribute_value_ids: childLine.attribute_value_ids,
                        };
                    }
                    return comboLineCopy;
                }),
                pricelist
            );
        });

        const combo_children_lines = orderlines.filter(
            (line) => line.price_type === "original" && line.comboParent
        );
        combo_children_lines.forEach((line) => {
            const parentPrices = attributes_prices[line.comboParent?.id] || [];
            const matchedItem = parentPrices.find(
                (item) =>
                    item?.comboLine?.id &&
                    line.comboLine?.id &&
                    item.comboLine.id === line.comboLine.id
            );
            if (matchedItem) {
                line.set_unit_price(matchedItem.price);
            }
            self.fix_tax_included_price(line);
        });
    },
    export_for_printing() {
        const result = super.export_for_printing(...arguments);
        const partner = this.get_partner();
        result.partner = partner ? {
            name: partner.name,
            vat: partner.vat,
            phone: partner.phone || partner.mobile,
            email: partner.email,
            street: partner.street,
            city: partner.city,
            zip: partner.zip,
        } : null;
        const orderlinesByName = {};
        for (const ol of this.get_orderlines()) {
            const key = ol.get_full_product_name();
            orderlinesByName[key] ??= [];
            orderlinesByName[key].push(ol);
        }
        for (const receiptLine of result.orderlines) {
            const key = receiptLine.productName;
            const orderline = orderlinesByName[key]?.shift();
            if (orderline) {
                receiptLine.uuid = orderline.uuid;
            }
        }
        for (const receiptLine of result.orderlines) {
            const orderline = this.get_orderlines().find(
                (ol) => ol.uuid === receiptLine.uuid
            );

            if (!orderline || !orderline.comboParent) {
                continue;
            }

            const paidQty = Number(orderline.paid_qty || 0);
            const selectedQty = Number(orderline.selected_qty || 0);
            const comboPrice = round(Number(orderline.combo_price || 0));

            const linePriceWithTax = round(
                comboPrice * paidQty
            );

            const isTopping = orderline.allow_quantity || (orderline.extra_price || 0) > 0 || (orderline.combo_price || 0) > 0;
            const finalQty = isTopping ? paidQty : (selectedQty || orderline.get_quantity() || 1);

            receiptLine.display_qty = selectedQty || orderline.get_quantity() || 1;
            receiptLine.selected_qty = selectedQty || orderline.get_quantity() || 1;
            receiptLine.free_qty = orderline.free_qty;
            receiptLine.paid_qty = paidQty;

            receiptLine.qty = String(finalQty);

            receiptLine.unitPrice =
                this.env.utils.formatCurrency(comboPrice);

            receiptLine.price =
                this.env.utils.formatCurrency(linePriceWithTax);
        }
        const groupedOrderlines = [];
        const childrenByParent = {};
        for (const ol of this.get_orderlines()) {
            if (ol.comboParent) {
                const parentUuid = ol.comboParent.uuid;
                childrenByParent[parentUuid] ??= [];
                childrenByParent[parentUuid].push(ol);
            }
        }
        for (const ol of this.get_orderlines()) {
            if (ol.comboParent) {
                continue;
            }
            const parentReceipt = result.orderlines.find(
                (r) => r.uuid === ol.uuid
            );
            if (parentReceipt) {
                groupedOrderlines.push(parentReceipt);
            }
            const children = childrenByParent[ol.uuid] || [];
            for (const child of children) {
                const childReceipt = result.orderlines.find(
                    (r) => r.uuid === child.uuid
                );

                if (childReceipt) {
                    groupedOrderlines.push(childReceipt);
                }
            }
        }
        result.orderlines = groupedOrderlines;
        const allOrderlines = this.get_orderlines();

        const comboParents = allOrderlines.filter(
            (ol) =>
                !ol.comboParent &&
                allOrderlines.some((l) => l.comboParent === ol)
        );

        if (!comboParents.length) {
            return result;
        }
        if (
            Array.isArray(this.combo_tax_details) &&
            this.combo_tax_details.length
        ) {
            result.tax_details = this.combo_tax_details;

            if (
                this.is_receipt_protected &&
                this.kiosk_amount_total !== null
            ) {
                result.amount_total = round(this.kiosk_amount_total);

                result.amount_tax = round(
                    this.kiosk_amount_tax ?? this.combo_tax_amount
                );

                result.total_without_tax = round(
                    result.amount_total - result.amount_tax
                );
            } else {
                result.amount_tax = round(
                    Number(this.combo_tax_amount || 0)
                );

                result.total_without_tax = round(
                    result.amount_total - result.amount_tax
                );
            }
        }
        return result;
    }
});