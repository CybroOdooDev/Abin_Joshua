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
from odoo import models


class PosSession(models.Model):
    _inherit = "pos.session"

    def _get_self_order_data(self):
        """The function is used ti load the fields in the products to self order"""
        result = super()._get_self_order_data()

        # Inject field into products sent to kiosk
        for product in result.get("products", []):
            # find matching template
            tmpl = self.env["product.template"].browse(product.get("product_tmpl_id"))
            product["free_combo_count"] = tmpl.free_combo_count or 2

        return result

    def _loader_params_pos_combo(self):
        """The function is used ti load the fields in the combos to self order"""
        result = super()._loader_params_pos_combo()
        fields = result['search_params'].get('fields', [])
        fields = list(set(fields + ['allow_quantity', 'free_limit']))
        result['search_params']['fields'] = fields
        return result

    def _loader_params_pos_payment_method(self):
        result = super()._loader_params_pos_payment_method()
        fields = result['search_params'].get('fields', [])
        fields = list(set(fields + ['is_cashsecurity_payment', 'is_dojo_payment']))
        result['search_params']['fields'] = fields
        return result

    def _close_kiosk_session_common(self):
        """
        Common close workflow without deleting draft orders.
        """
        self.ensure_one()
        self.env["bus.bus"]._sendone(
            f"pos_config-{self.access_token}",
            "STATUS",
            {
                "status": "closed",
            },
        )
        return self.action_pos_session_closing_control()
