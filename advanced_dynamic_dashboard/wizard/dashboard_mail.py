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
import base64
from odoo import fields, models


class DashboardMail(models.TransientModel):
    """Class to create new dashboard mail"""
    _name = 'dashboard.mail'
    _description = 'Dashboard Mail'

    user_ids = fields.Many2many('res.users',
                                domain="[('id','!=', uid)]",
                                help="Select users to receive the dashboard report")
    base64code = fields.Char(help='Base64 code of the PDF')

    def send_mail(self):
        """
        Function for sending mail to the selected users
        """
        for user in self.user_ids:
            greeting = self.env._("Hi %(name)s,", name=user.name)
            intro = self.env._("I hope this email finds you well.")
            msg = self.env._("I am pleased to share the Dashboard Report with you.")
            attachment_msg = self.env._("Please find the attachment.")
            mail_content = f"<p>{greeting}</p><p>{intro} {msg}</p><p>{attachment_msg}</p>"
            mail_values = {
                'subject': self.env._('Dashboard Report'),
                'author_id': self.env.user.partner_id.id,
                'body_html': mail_content,
                'email_to': user.email,
            }
            mail_id = self.env['mail.mail'].create(mail_values)
            raw_data = base64.b64decode(self.base64code) if self.base64code else b''
            attachment_values = {
                'name': 'Dashboard.pdf',
                'raw': raw_data,
                'type': 'binary',
                'res_model': 'mail.mail',
                'res_id': mail_id.id,
            }
            attachment_id = self.env['ir.attachment'].create(attachment_values)
            mail_id.write({
                'attachment_ids': [(4, attachment_id.id)]
            })
            mail_id.send()

        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
        }

    def cancel_mail(self):
        """
        Function for refreshing the page while clicking cancel
        """
        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
        }
