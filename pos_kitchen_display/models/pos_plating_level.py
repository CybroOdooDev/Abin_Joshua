# -*- coding: utf-8 -*-

from odoo import fields, models


class PosPlatingLevel(models.Model):
    _name = "pos.plating.level"
    _description = "POS Plating Level"
    _order = "sequence, id"

    name = fields.Char(string="Name", required=True, translate=True)
    sequence = fields.Integer(string="Sequence", default=10)
    color = fields.Char(string="Color", default="#3B82F6")
    is_default = fields.Boolean(string="Default Course", default=False)
