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
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU LESSER GENERAL PUBLIC LICENSE (LGPL v3) for more details.
#
#############################################################################
import base64
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestDashboardMail(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.recipient_user = cls.env['res.users'].create({
            'name': 'Recipient User',
            'login': 'recipient@example.com',
            'email': 'recipient@example.com',
        })

    def test_send_dashboard_mail(self):
        """Test sending dashboard report via mail with attachment."""
        dummy_pdf_b64 = base64.b64encode(b'%PDF-1.4 dummy pdf content').decode('utf-8')
        wizard = self.env['dashboard.mail'].create({
            'user_ids': [(4, self.recipient_user.id)],
            'base64code': dummy_pdf_b64,
        })
        action = wizard.send_mail()
        self.assertEqual(action.get('type'), 'ir.actions.client')
        self.assertEqual(action.get('tag'), 'reload')

        mail = self.env['mail.mail'].search([('email_to', '=', self.recipient_user.email)], order='id desc', limit=1)
        self.assertTrue(mail)
        self.assertEqual(mail.subject, 'Dashboard Report')
        self.assertTrue(mail.attachment_ids)
        self.assertEqual(mail.attachment_ids[0].name, 'Dashboard.pdf')

    def test_cancel_dashboard_mail(self):
        """Test canceling dashboard mail wizard."""
        wizard = self.env['dashboard.mail'].create({
            'user_ids': [(4, self.recipient_user.id)],
        })
        action = wizard.cancel_mail()
        self.assertEqual(action.get('type'), 'ir.actions.client')
        self.assertEqual(action.get('tag'), 'reload')
