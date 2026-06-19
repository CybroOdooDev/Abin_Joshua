# -*- coding: utf-8 -*-
from odoo.tests.common import TransactionCase


class TestSaleOrder(TransactionCase):

    def setUp(self):
        super().setUp()

        self.customer = self.env['res.partner'].create({
            'name': 'Test Customer',
        })

        self.product = self.env['product.product'].create({
            'name': 'Test Product',
            'list_price': 100.0,
        })

    def test_sale_order_amount_in_words(self):
        sale_order = self.env['sale.order'].create({
            'partner_id': self.customer.id,
            'order_line': [(0, 0, {
                'product_id': self.product.id,
                'name': 'Test Product',
                'product_uom_qty': 2,
                'price_unit': 100,
            })]
        })

        expected = sale_order.currency_id.amount_to_text(
            sale_order.amount_total
        )

        self.assertEqual(
            sale_order.number_to_words,
            expected
        )