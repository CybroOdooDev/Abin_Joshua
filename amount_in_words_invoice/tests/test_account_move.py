# -*- coding: utf-8 -*-
from odoo.tests.common import TransactionCase
print("TEST FILE LOADED")


class TestAccountMove(TransactionCase):

    def setUp(self):
        super().setUp()

        self.partner = self.env['res.partner'].create({
            'name': 'Test Customer'
        })

        self.product = self.env['product.product'].create({
            'name': 'Test Product',
            'list_price': 100.0,
        })

    def test_invoice_amount_in_words(self):
        print("TEST FILE IMPORTED")
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner.id,
            'invoice_line_ids': [(0, 0, {
                'product_id': self.product.id,
                'quantity': 2,
                'price_unit': 100,
                'name': 'Test Line',
            })]
        })

        invoice._compute_number_to_words()

        expected = invoice.currency_id.amount_to_text(
            invoice.amount_total
        )

        self.assertEqual(
            invoice.number_to_words,
            expected
        )