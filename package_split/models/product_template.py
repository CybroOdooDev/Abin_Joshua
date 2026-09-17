# -*- coding: utf-8 -*-
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
#############################################################################
from odoo import fields, models


class ProductTemplate(models.Model):
    """Inhering to add new field for package category"""
    _inherit = 'product.template'

    package_category_id = fields.Many2one(
        'package.category', string="Package Category", help="Package category")
    package_split_value = fields.Boolean(
        string='Package Split Value', compute='_compute_package_split_value',
        help="This field value is set to true if the field to enable package "
             "split is enabled")

    def _compute_package_split_value(self):
        """function to set value to the field package_split_value from
         system parameter"""
        value = self.env['ir.config_parameter'].sudo().get_bool(
            'package_split.enable_package_split')
        for record in self:
            record.package_split_value = value
