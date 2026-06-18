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
from odoo.tests.common import TransactionCase


class TestAccountMove(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super(TestAccountMove, cls).setUpClass()
        cls.partner = cls.env['res.partner'].create({
            'name': 'Test Invoice Partner',
        })
        cls.move = cls.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': cls.partner.id,
        })

    def test_action_add_product(self):
        """Test the action_add_product returns correct act_window action."""
        action = self.move.action_add_product()
        self.assertEqual(action.get('type'), 'ir.actions.act_window')
        self.assertEqual(action.get('res_model'), 'product.product')
        self.assertEqual(action.get('view_mode'), 'kanban,list,form')
        self.assertEqual(action.get('target'), 'current')
        self.assertEqual(action.get('context'), {'add_to_invoice': True})
