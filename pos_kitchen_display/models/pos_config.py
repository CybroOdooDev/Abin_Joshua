# -*- coding: utf-8 -*-

from odoo import fields, models


class PosConfig(models.Model):
    _inherit = "pos.config"

    ask_diners_on_table_open = fields.Boolean(
        string="Prompt for Number of Diners",
        default=True,
        help="Automatically prompt the waiter for the number of diners when opening a table."
    )


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    pos_ask_diners_on_table_open = fields.Boolean(
        related="pos_config_id.ask_diners_on_table_open",
        readonly=False
    )
