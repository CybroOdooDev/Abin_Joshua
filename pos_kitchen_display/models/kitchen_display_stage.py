# -*- coding: utf-8 -*-

from odoo import models, fields

class KitchenDisplayStage(models.Model):
    _name = "kitchen.display.stage"
    _description = "Kitchen Display Stage"

    name = fields.Char(required=True)
    color = fields.Char(string="Color")
    alert_timer = fields.Integer(
        string="Alert timer (min)",
        default=0)
    sequence = fields.Integer(default=1)
    display_id = fields.Many2one(
        "kitchen.display",
        ondelete="cascade")