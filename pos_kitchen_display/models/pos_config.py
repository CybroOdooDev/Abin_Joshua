# -*- coding: utf-8 -*-

from odoo import api, fields, models


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

    @api.model_create_multi
    def create(self, vals_list):
        res = super().create(vals_list)
        if any("enable_plating_level" in vals for vals in vals_list):
            self._sync_plating_level_group()
        return res

    def write(self, vals):
        res = super().write(vals)
        if "enable_plating_level" in vals:
            self._sync_plating_level_group()
        return res

    @api.model
    def _sync_plating_level_group(self):
        group = self.env.ref("pos_kitchen_display.group_pos_plating_level", raise_if_not_found=False)
        if not group:
            return
        any_enabled = bool(self.env["pos.config"].sudo().search([("enable_plating_level", "=", True)], limit=1))
        base_user = self.env.ref("base.group_user", raise_if_not_found=False)
        pos_user = self.env.ref("point_of_sale.group_pos_user", raise_if_not_found=False)
        pos_manager = self.env.ref("point_of_sale.group_pos_manager", raise_if_not_found=False)
        target_groups = self.env["res.groups"]
        if base_user:
            target_groups |= base_user
        if pos_user:
            target_groups |= pos_user
        if pos_manager:
            target_groups |= pos_manager

        if any_enabled:
            for grp in target_groups:
                if group not in grp.implied_ids:
                    grp.sudo().write({"implied_ids": [(4, group.id)]})
        else:
            for grp in target_groups:
                if group in grp.implied_ids:
                    grp.sudo().write({"implied_ids": [(3, group.id)]})
            group.sudo().write({"users": [(5, 0, 0)]})


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    pos_ask_diners_on_table_open = fields.Boolean(
        related="pos_config_id.ask_diners_on_table_open",
        readonly=False
    )
    pos_enable_plating_level = fields.Boolean(
        related="pos_config_id.enable_plating_level",
        readonly=False,
    )
    pos_enable_auto_appetizer = fields.Boolean(
        related="pos_config_id.enable_auto_appetizer",
        readonly=False
    )
    pos_appetizer_product_ids = fields.Many2many(
        related="pos_config_id.appetizer_product_ids",
        readonly=False
    )

    def set_values(self):
        super().set_values()
        self.env["pos.config"]._sync_plating_level_group()


