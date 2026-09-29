# -*- coding: utf-8 -*-

from odoo import fields, models


class PosConfig(models.Model):
    _inherit = "pos.config"

    ask_diners_on_table_open = fields.Boolean(
        string="Prompt for Number of Diners",
        default=True,
        help="Automatically prompt the waiter for the number of diners when opening a table."
    )
    enable_plating_level = fields.Boolean(
        string="Plating Level",
        default=False,
        help="Enable Plating Levels / Courses in POS."
    )
    enable_auto_appetizer = fields.Boolean(
        string="Automatic Appetizer",
        default=False,
        help="Prompt for an appetizer and dispatch to kitchen immediately when opening a table."
    )
    appetizer_product_ids = fields.Many2many(
        "product.product",
        string="Selectable Appetizers",
        domain="[('available_in_pos', '=', True)]",
        help="Products available to choose from as automatic appetizers when opening a table."
    )

    def _get_available_product_domain(self):
        domain = super()._get_available_product_domain()
        if self.enable_auto_appetizer and self.appetizer_product_ids:
            domain = ['|'] + domain + [('id', 'in', self.appetizer_product_ids.ids)]
        return domain


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    pos_ask_diners_on_table_open = fields.Boolean(
        related="pos_config_id.ask_diners_on_table_open",
        readonly=False
    )
    pos_enable_plating_level = fields.Boolean(
        related="pos_config_id.enable_plating_level",
        readonly=False,
        implied_group="pos_kitchen_display.group_pos_plating_level"
    )
    pos_enable_auto_appetizer = fields.Boolean(
        related="pos_config_id.enable_auto_appetizer",
        readonly=False
    )
    pos_appetizer_product_ids = fields.Many2many(
        related="pos_config_id.appetizer_product_ids",
        readonly=False
    )


