# -*- coding: utf-8 -*-
#############################################################################
#
#    Cybrosys Technologies Pvt. Ltd.
#
#    Copyright (C) 2024-TODAY Cybrosys Technologies(<https://www.cybrosys.com>)
#    Author: Cybrosys Techno Solutions (odoo@cybrosys.com)
#
#    You can modify it under the terms of the GNU LESSER
#    GENERAL PUBLIC LICENSE (LGPL v3), Version 3.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU LESSER GENERAL PUBLIC LICENSE (LGPL v3) for more details.
#
#    You should have received a copy of the GNU LESSER GENERAL PUBLIC LICENSE
#    (LGPL v3) along with this program.
#    If not, see <http://www.gnu.org/licenses/>.
#
#############################################################################
from datetime import date, timedelta
from odoo.tests.common import TransactionCase
from odoo import fields


class TestProductProduct(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super(TestProductProduct, cls).setUpClass()
        # Create partner
        cls.partner = cls.env['res.partner'].create({
            'name': 'Test Customer',
        })
        
        # Search for income/expense accounts or use defaults
        income_account = cls.env['account.account'].search([
            ('account_type', 'in', ('income', 'income_other'))
        ], limit=1)
        expense_account = cls.env['account.account'].search([
            ('account_type', 'in', ('expense', 'expense_depreciation', 'expense_direct_cost'))
        ], limit=1)
        
        # Create products
        cls.product = cls.env['product.product'].create({
            'name': 'Test Product A',
            'lst_price': 100.0,
            'standard_price': 60.0,
            'property_account_income_id': income_account.id,
            'property_account_expense_id': expense_account.id,
        })
        # Create an account move (customer invoice)
        cls.invoice = cls.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': cls.partner.id,
        })

    def test_compute_add_to_invoice(self):
        """Test the compute method for add_to_invoice field."""
        # By default without context
        product_no_ctx = self.product
        self.assertFalse(product_no_ctx.add_to_invoice)

        # With context add_to_invoice = True
        product_ctx = self.product.with_context(add_to_invoice=True)
        self.assertTrue(product_ctx.add_to_invoice)

    def test_get_invoice_account(self):
        """Test retrieving the correct income/expense account."""
        income_account = self.product._get_invoice_account(self.invoice)
        self.assertTrue(income_account)

        # Create a vendor bill
        vendor_bill = self.env['account.move'].create({
            'move_type': 'in_invoice',
            'partner_id': self.partner.id,
        })
        expense_account = self.product._get_invoice_account(vendor_bill)
        self.assertTrue(expense_account)

    def test_action_add_to_invoice(self):
        """Test adding a product to the invoice."""
        self.assertEqual(len(self.invoice.invoice_line_ids), 0)

        # Call action_add_to_invoice with the invoice in context
        product_with_ctx = self.product.with_context(active_id=self.invoice.id)
        product_with_ctx.action_add_to_invoice()

        self.assertEqual(len(self.invoice.invoice_line_ids), 1)
        line = self.invoice.invoice_line_ids[0]
        self.assertEqual(line.product_id, self.product)
        self.assertEqual(line.quantity, 1.0)
        self.assertEqual(line.price_unit, 100.0)

    def test_action_change_qty(self):
        """Test the action_change_qty action dictionary."""
        product_with_ctx = self.product.with_context(active_id=self.invoice.id)
        action = product_with_ctx.action_change_qty()
        
        self.assertEqual(action.get('type'), 'ir.actions.act_window')
        self.assertEqual(action.get('res_model'), 'invoice.product.details')
        self.assertEqual(action.get('view_mode'), 'form')
        self.assertEqual(action.get('target'), 'new')
        self.assertEqual(action.get('context').get('default_account_move_id'), self.invoice.id)
        self.assertEqual(action.get('context').get('default_product_id'), self.product.id)
        self.assertEqual(action.get('context').get('default_price_unit'), 100.0)

    def test_wizard_functionality(self):
        """Test the invoice.product.details wizard."""
        # 1. Test creation and default values
        wizard = self.env['invoice.product.details'].with_context(
            default_account_move_id=self.invoice.id,
            default_product_id=self.product.id,
            default_price_unit=100.0,
        ).create({
            'qty': 5.0,
        })
        
        self.assertEqual(wizard.account_move_id, self.invoice)
        self.assertEqual(wizard.product_id, self.product)
        self.assertEqual(wizard.price_unit, 100.0)
        self.assertEqual(wizard.qty, 5.0)

        # 2. Test action_add_to_invoice on wizard
        initial_lines_count = len(self.invoice.invoice_line_ids)
        wizard.action_add_to_invoice()
        
        self.assertEqual(len(self.invoice.invoice_line_ids), initial_lines_count + 1)
        new_line = self.invoice.invoice_line_ids.filtered(lambda l: l.quantity == 5.0)
        self.assertTrue(new_line)
        self.assertEqual(new_line.price_unit, 100.0)
        self.assertEqual(new_line.product_id, self.product)

    def test_wizard_invoice_history(self):
        """Test retrieving history in the wizard."""
        # Create and post another invoice to populate history
        history_invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner.id,
            'invoice_date': date.today() - timedelta(days=5),
        })
        # Add a line to history_invoice
        account_id = self.product._get_invoice_account(history_invoice)
        self.env['account.move.line'].create({
            'move_id': history_invoice.id,
            'product_id': self.product.id,
            'quantity': 3.0,
            'price_unit': 90.0,
            'account_id': account_id.id,
        })
        # Post the history invoice
        history_invoice.action_post()

        # Create wizard and trigger onchange
        wizard = self.env['invoice.product.details'].create({
            'product_id': self.product.id,
            'account_move_id': self.invoice.id,
            'price_unit': 100.0,
            'date_from': date.today() - timedelta(days=10),
            'limit': 10,
        })
        
        # Call onchange method manually
        wizard._onchange_date_from()
        
        self.assertEqual(len(wizard.invoice_history_ids), 1)
        history_record = wizard.invoice_history_ids[0]
        self.assertEqual(history_record.qty, 3.0)
        self.assertEqual(history_record.price_unit, 90.0)
        self.assertEqual(history_record.move_id, history_invoice)
