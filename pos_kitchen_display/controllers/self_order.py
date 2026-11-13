# -- coding: utf-8 --
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
from odoo.addons.pos_self_order.controllers.orders import PosSelfOrderController
from odoo import http


class KitchenSelfOrderController(PosSelfOrderController):

    @http.route(
        '/pos-self-order/process-new-order/<device_type>/',
        auth="public", type="json", website=True
    )
    def process_new_order(self, order, access_token, table_identifier, device_type):
        result = super().process_new_order(
            order, access_token, table_identifier, device_type
        )
        order_id = result.get("id")
        if order_id:
            pos_order = http.request.env["pos.order"].sudo().browse(order_id)
            if pos_order.state in ("paid", "done", "invoiced"):
                pos_order._create_kitchen_order()
        return result