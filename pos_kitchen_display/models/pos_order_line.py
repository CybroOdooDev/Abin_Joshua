# -*- coding: utf-8 -*-
from odoo import fields, models


class PosOrderLine(models.Model):
    _inherit = "pos.order.line"

    free_qty = fields.Float(default=0, help="Free Quantity")
    paid_qty = fields.Float(default=0, help="Paid Quantity")
    plating_level_id = fields.Many2one("pos.plating.level", string="Plating Level")

    def _order_line_fields(self, line, session_id=None):
        vals = super()._order_line_fields(line, session_id)
        if isinstance(vals, (list, tuple)) and len(vals) >= 3 and isinstance(vals[2], dict):
            vals[2].update({
                "selected_qty": line[2].get("selected_qty", 0),
                "paid_qty": line[2].get("paid_qty", 0),
                "free_qty": line[2].get("free_qty", 0),
                "plating_level_id": line[2].get("plating_level_id", False),
            })
        return vals

    def _export_for_ui(self, orderline):
        vals = super()._export_for_ui(orderline)
        vals.update({
            "plating_level_id": orderline.plating_level_id.id if orderline.plating_level_id else False,
        })
        return vals