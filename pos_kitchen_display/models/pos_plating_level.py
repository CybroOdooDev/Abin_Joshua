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
from odoo import api, fields, models


class PosPlatingLevel(models.Model):
    _name = "pos.plating.level"
    _description = "POS Plating Level"
    _order = "sequence, id"

    name = fields.Char(string="Name", required=True, translate=True)
    sequence = fields.Integer(string="Sequence", default=10)
    color = fields.Char(string="Color", default="#3B82F6")
    is_default = fields.Boolean(string="Default Course", default=False)

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for rec in records:
            if rec.is_default:
                self.search([("id", "!=", rec.id), ("is_default", "=", True)]).write({"is_default": False})
        return records

    def write(self, vals):
        res = super().write(vals)
        if vals.get("is_default"):
            for rec in self:
                if rec.is_default:
                    self.search([("id", "!=", rec.id), ("is_default", "=", True)]).write({"is_default": False})
        return res
