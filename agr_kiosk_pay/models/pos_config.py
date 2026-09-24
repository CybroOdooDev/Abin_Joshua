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
#    You should have received a copy of the GNU LESSER GENERAL PUBLIC LICENSE
#    (LGPL v3) along with this program.
#    If not, see <http://www.gnu.org/licenses/>.
#
#############################################################################
from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    cashbox_code = fields.Char(
        string='CashSecurity Cashbox Code',
        default='01',
    )
    cash_security_url = fields.Char(
        string='CashSecurity URL',
        help='CashSecurity URL for Kiosk',
    )

    dojo_terminal_id = fields.Char(
        string='CashSecurity Dojo Terminal ID',
        help='CashSecurity Dojo Terminal ID for Kiosk',
    )

    def _get_self_ordering_data(self):
        """The function is used to load the fields"""
        data = super()._get_self_ordering_data()
        data["config"]["cashbox_code"] = self.cashbox_code
        data["config"]["cash_security_url"] = self.cash_security_url
        data["config"]["dojo_terminal_id"] = self.dojo_terminal_id
        return data
