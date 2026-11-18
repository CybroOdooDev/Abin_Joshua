# -*- coding: utf-8 -*-
#############################################################################
#
#    Cybrosys Technologies Pvt. Ltd.
#
#    Copyright (C) 2026-TODAY Cybrosys Technologies(<https://www.cybrosys.com>)
#    Author: Cybrosys Techno Solutions(<https://www.cybrosys.com>)
#
#    You can modify it under the terms of the GNU LESSER
#    GENERAL PUBLIC LICENSE (LGPL v3), Version 3.
#
#    This program is distributed in the hope it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU LESSER GENERAL PUBLIC LICENSE (LGPL v3) for more details.
#
#    You should have received a copy of the GNU LESSER GENERAL PUBLIC LICENSE
#    (LGPL v3) along with this program.
#    If not, see <http://www.gnu.org/licenses/>.
#
#############################################################################
from odoo.fields import Command
from odoo.tests import tagged
from odoo.tests.common import TransactionCase


@tagged('post_install', '-at_install')
class TestHotelPosExtension(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.partner = cls.env['res.partner'].create({
            'name': 'Test Hotel Guest',
        })
        cls.payment_method = cls.env['pos.payment.method'].create({
            'name': 'Hotel Charge',
            'type': 'pay_later',
            'is_hotel_charge': True,
        })
        cls.standard_payment_method = cls.env['pos.payment.method'].create({
            'name': 'Cash Test Method',
            'type': 'pay_later',
            'is_hotel_charge': False,
        })

    def test_load_pos_data_fields(self):
        """Test hotel charge field loading in POS data."""
        fields_list = self.payment_method._load_pos_data_fields(False)
        self.assertIn('is_hotel_charge', fields_list)

    def test_write_forbidden_install_mode(self):
        """Test install mode bypass on payment method write."""
        result = self.payment_method.with_context(install_mode=True)._is_write_forbidden(['name'])
        self.assertFalse(result)

    def test_compute_hotel_pos_status(self):
        """Test hotel pos status computation across states."""
        order_paid = self.env['pos.order'].new({'state': 'paid'})
        order_paid._compute_hotel_pos_status()
        self.assertEqual(order_paid.hotel_pos_status, 'paid')

        order_done = self.env['pos.order'].new({'state': 'done'})
        order_done._compute_hotel_pos_status()
        self.assertEqual(order_done.hotel_pos_status, 'done')

        order_draft = self.env['pos.order'].new({'state': 'draft'})
        order_draft._compute_hotel_pos_status()
        self.assertEqual(order_draft.hotel_pos_status, 'draft')

    def test_account_move_line_reconcile_skip(self):
        """Test account move line reconcile skip flag."""
        move = self.env['account.move'].create({
            'move_type': 'entry',
            'partner_id': self.partner.id,
            'line_ids': [
                Command.create({
                    'name': 'Debit line',
                    'account_id': self.env['account.account'].search(
                        [('account_type', '=', 'asset_receivable')], limit=1
                    ).id,
                    'debit': 100.0,
                    'credit': 0.0,
                }),
                Command.create({
                    'name': 'Credit line',
                    'account_id': self.env['account.account'].search(
                        [('account_type', '=', 'income')], limit=1
                    ).id,
                    'debit': 0.0,
                    'credit': 100.0,
                }),
            ],
        })
        line = move.line_ids[0]
        res = line.with_context(skip_pos_invoice_reconciliation=True).reconcile()
        self.assertTrue(res)

    def test_reconcile_invoice_payments_hotel_charge_skip(self):
        """Test POS order reconciliation skip for hotel charge payment method."""
        order = self.env['pos.order'].new()
        payment = self.env['pos.payment'].new({
            'payment_method_id': self.payment_method,
        })
        order.payment_ids = payment
        res = order._reconcile_invoice_payments(False, False)
        self.assertIsNone(res)

    def test_room_booking_computes_and_actions(self):
        """Test room booking computes and invoice action with no pos orders."""
        booking = self.env['room.booking'].new({
            'partner_id': self.partner.id,
            'name': 'BOOK/TEST/001',
        })
        booking._compute_has_pos_orders()
        self.assertFalse(booking.has_pos_orders)

        booking._compute_amount_total_pos()
        self.assertEqual(booking.amount_total_pos, 0.0)

        booking._compute_pos_invoice_count()
        self.assertEqual(booking.pos_invoice_count, 0)

        action = booking.action_view_pos_invoices()
        self.assertEqual(action.get('type'), 'ir.actions.act_window_close')

    def test_hotel_pos_line_creation(self):
        """Test direct hotel pos line creation and relation links."""
        booking = self.env['room.booking'].create({
            'partner_id': self.partner.id,
        })
        pos_line = self.env['hotel.pos.line'].create({
            'booking_id': booking.id,
        })
        self.assertEqual(pos_line.booking_id, booking)
        self.assertIn(pos_line, booking.pos_order_line_ids)
        booking._compute_has_pos_orders()
        self.assertTrue(booking.has_pos_orders)

    def test_account_move_compute_status_in_payment(self):
        """Test status_in_payment remains not_paid for hotel pos invoice even if sent."""
        order = self.env['pos.order'].new()
        payment = self.env['pos.payment'].new({
            'payment_method_id': self.payment_method,
        })
        order.payment_ids = payment
        move = self.env['account.move'].new({
            'state': 'posted',
            'payment_state': 'not_paid',
            'is_move_sent': True,
            'pos_order_ids': order,
        })
        move._compute_status_in_payment()
        self.assertEqual(move.status_in_payment, 'not_paid')
