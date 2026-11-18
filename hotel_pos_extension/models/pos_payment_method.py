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
from odoo import api, fields, models


class PosPaymentMethod(models.Model):
    """Extend POS payment method for hotel charge support."""
    _inherit = 'pos.payment.method'

    is_hotel_charge = fields.Boolean(
        help='Check this if you want to use this payment method for hotel room charge.'
    )

    @api.model_create_multi
    def create(self, vals_list):
        """Default type to 'pay_later' if creating a hotel charge without journal."""
        clean_vals_list = []
        for vals in vals_list:
            vals_copy = dict(vals)
            if vals_copy.get('is_hotel_charge') and not vals_copy.get('type') and not vals_copy.get('journal_id'):
                vals_copy['type'] = 'pay_later'
            clean_vals_list.append(vals_copy)
        return super().create(clean_vals_list)

    @api.model
    def _load_pos_data_fields(self, config):
        """Expose `is_hotel_charge` in the POS frontend models."""
        fields_list = super()._load_pos_data_fields(config)
        if 'is_hotel_charge' not in fields_list:
            fields_list.append('is_hotel_charge')
        return fields_list

    def _is_write_forbidden(self, fields):
        """Bypass validation blocks during module installation/upgrades."""
        if self.env.context.get('install_mode'):
            return False
        return super()._is_write_forbidden(fields)
