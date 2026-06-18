# -*- coding: utf-8 -*-
###############################################################################
#
#    Cybrosys Technologies Pvt. Ltd.
#    Copyright (C) 2024-TODAY Cybrosys Technologies(<https://www.cybrosys.com>).
#    Author: ATHIRA K (odoo@cybrosys.com)
#
#    This program is free software: you can modify
#    it under the terms of the GNU LESSER GENERAL PUBLIC LICENSE (LGPL) as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU LESSER GENERAL PUBLIC LICENSE for more details.
#
#    You should have received a copy of the GNU LESSER GENERAL PUBLIC LICENSE
#    along with this program.  If not, see <https://www.gnu.org/licenses/>.
#
###############################################################################
from odoo.tests.common import TransactionCase


class TestPartnerDocuments(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super(TestPartnerDocuments, cls).setUpClass()
        # Create a test partner
        cls.partner = cls.env['res.partner'].create({
            'name': 'Test Contact',
            'email': 'test@example.com',
        })

    def test_document_count_computation(self):
        """Test that the document count computes correctly based on attachments."""
        # Initially, there should be no attachments, so document_count should be '0'
        # Since document_count is a computed Char field, check it is '0'
        self.assertEqual(self.partner.document_count, '0', "Initial document count should be '0'")

        # Create an attachment linked to the partner
        self.env['ir.attachment'].create({
            'name': 'Test Document 1',
            'res_model': 'res.partner',
            'res_id': self.partner.id,
            'datas': b'dGVzdDE=', # base64 for 'test1'
        })
        self.partner.invalidate_recordset(['document_count'])
        self.assertEqual(self.partner.document_count, '1', "Document count should be '1' after adding one attachment")

        # Create another attachment linked to the partner
        self.env['ir.attachment'].create({
            'name': 'Test Document 2',
            'res_model': 'res.partner',
            'res_id': self.partner.id,
            'datas': b'dGVzdDI=', # base64 for 'test2'
        })
        self.partner.invalidate_recordset(['document_count'])
        self.assertEqual(self.partner.document_count, '2', "Document count should be '2' after adding a second attachment")

        # Create an attachment linked to another model to ensure it is not counted
        self.env['ir.attachment'].create({
            'name': 'Test Document 3',
            'res_model': 'res.users',
            'res_id': self.partner.id,
            'datas': b'dGVzdDM=',
        })
        self.partner.invalidate_recordset(['document_count'])
        self.assertEqual(self.partner.document_count, '2', "Document count should remain '2' when an attachment to another model is added")

    def test_action_partner_documents(self):
        """Test the action returning the documents for the partner."""
        action = self.partner.action_partner_documents()
        self.assertEqual(action.get('type'), 'ir.actions.act_window')
        self.assertEqual(action.get('res_model'), 'ir.attachment')
        self.assertEqual(action.get('view_mode'), 'kanban,form')
        self.assertEqual(action.get('domain'), [('res_id', '=', self.partner.id), ('res_model', '=', 'res.partner')])
        self.assertEqual(action.get('context'), {'create': False})
