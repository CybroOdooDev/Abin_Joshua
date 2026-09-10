# -*- coding: utf-8 -*-
################################################################################
#
#    Cybrosys Technologies Pvt. Ltd.
#    Copyright (C) 2026-TODAY Cybrosys Technologies(<https://www.cybrosys.com>).
#    Author: Cybrosys Technologies (odoo@cybrosys.com)
#
#    This program is free software: you can modify
#    it under the terms of the GNU Affero General Public License (AGPL) as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU Affero General Public License for more details.
#
#    You should have received a copy of the GNU Affero General Public License
#    along with this program.  If not, see <https://www.gnu.org/licenses/>.
#
################################################################################
from odoo import fields, models


class ResUsers(models.Model):
    """ Inherited the res_users model for adding the products
    and product category"""
    _inherit = 'res.users'

    restricted_type = fields.Selection(
        [('product', 'Product'), ('category', 'Category')],
        string='Restriction Type', default='product',
        help='choose Product and Product category depends upon your need')
    allowed_product_ids = fields.Many2many(
        comodel_name='product.template',
        relation='product_template_res_users_rel',
        column1='res_users_id',
        column2='product_template_id',
        string="Products", store=True,
        help='Show to allow the products for assigned users')
    allowed_product_category_ids = fields.Many2many(
        comodel_name='product.category',
        string="Product Category", store=True,
        help='Show to allow the product category for assigned users')
    is_admin = fields.Boolean(compute='_compute_is_admin',
                              help='Check the user is admin or not')

    def write(self, vals):
        """Clear access caches when product restrictions are changed."""
        res = super().write(vals)
        if {'restricted_type', 'allowed_product_ids', 'allowed_product_category_ids'} & set(vals):
            self.env['ir.access']._clear_caches()
        return res

    def _compute_is_admin(self):
        """ Compute the value of is_admin based on whether the user is admin or not"""
        for user in self:
            user.is_admin = user.has_group('base.group_erp_manager')
