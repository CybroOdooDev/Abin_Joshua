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