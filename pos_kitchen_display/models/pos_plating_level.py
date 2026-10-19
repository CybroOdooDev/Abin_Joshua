# -*- coding: utf-8 -*-

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
