# -*- coding: utf-8 -*-

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