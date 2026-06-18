# -*- coding: utf-8 -*-
from odoo.tests.common import TransactionCase


class TestPurchaseOrder(TransactionCase):

    def setUp(self):
        super().setUp()

        self.vendor = self.env['res.partner'].create({
            'name': 'Test Vendor',
            'supplier_rank': 1,
        })

        self.product = self.env['product.product'].create({
            'name': 'Test Product',
            'standard_price': 100.0,
        })

    def test_purchase_order_amount_in_words(self):
        purchase_order = self.env['purchase.order'].create({
            'partner_id': self.vendor.id,
            'order_line': [(0, 0, {
                'product_id': self.product.id,
                'name': 'Test Product',
                'product_qty': 2,
                'price_unit': 100,
                'date_planned': '2026-06-18 10:00:00',
            })]
        })

        expected = purchase_order.currency_id.amount_to_text(
            purchase_order.amount_total
        )

        self.assertEqual(
            purchase_order.number_to_words,
            expected
        )