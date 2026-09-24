# -*- coding: utf-8 -*-
from odoo import fields, models


class PosOrderLine(models.Model):
    _inherit = "pos.order.line"

    free_qty = fields.Float(default=0, help="Free Quantity")
    paid_qty = fields.Float(default=0, help="Paid Quantity")

    def _order_line_fields(self, line, session_id=None):
        vals = super()._order_line_fields(line, session_id)
        vals.append({
            "selected_qty": line[2].get("selected_qty", 0),
            "paid_qty": line[2].get("paid_qty", 0),
            "free_qty": line[2].get("free_qty", 0),
        })
        return vals