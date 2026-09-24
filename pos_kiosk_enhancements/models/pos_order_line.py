from odoo import fields, models

class PosOrderLine(models.Model):
    _inherit = "pos.order.line"

    selected_qty = fields.Float(string="Selected Qty", help="Selected Qty")
    paid_qty = fields.Float(string="Paid Qty", help="Paid Qty")
    free_qty = fields.Float(string="Free Qty", help="Free Qty")
    combo_price = fields.Float(string="Combo Price", help="Combo Price")

    def _export_for_ui(self, orderline):
        vals = super()._export_for_ui(orderline)
        vals.update({
            "selected_qty": orderline.selected_qty,
            "paid_qty": orderline.paid_qty,
            "free_qty": orderline.free_qty,
            "combo_price": orderline.combo_price,
        })
        return vals