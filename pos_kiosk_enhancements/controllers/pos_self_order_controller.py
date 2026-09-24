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
import logging
from odoo import http
from odoo.addons.pos_self_order.controllers.orders import PosSelfOrderController

_logger = logging.getLogger(__name__)


class PosSelfOrderControllerInherit(PosSelfOrderController):

    def process_new_order(self, order, access_token, table_identifier, device_type):
        # Keep frontend line prices before Odoo recomputes combo lines
        order_lines_by_uuid = {
            line.get("uuid"): line
            for line in order.get("lines", [])
            if line.get("uuid")
        }

        result = super().process_new_order(
            order,
            access_token,
            table_identifier,
            device_type
        )

        posted_order_id = result.get("id") if isinstance(result, dict) else False
        if not posted_order_id:
            return result
        pos_order = http.request.env["pos.order"].sudo().browse(posted_order_id)
        if pos_order.exists():
            for record in pos_order.lines:
                json_line = order_lines_by_uuid.get(record.uuid)
                if not json_line:
                    continue

                record.write({
                    "price_unit": float(json_line.get("price_unit") or 0.0),
                    "discount": float(json_line.get("discount") or 0.0),
                    "price_subtotal": float(json_line.get("price_subtotal") or 0.0),
                    "price_subtotal_incl": float(json_line.get("price_subtotal_incl") or 0.0),
                })

            amount_total = float(order.get("amount_total") or 0.0)
            amount_tax = float(order.get("amount_tax") or 0.0)
            pos_order.write({
                "amount_total": amount_total,
                "amount_tax": amount_tax,
            })

            _logger.info(
                "KIOSK COMBO AMOUNT FIXED: %s total=%s tax=%s state=%s",
                pos_order.pos_reference,
                amount_total,
                amount_tax,
                pos_order.state,
            )
        return result