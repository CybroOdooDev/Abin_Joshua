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
#    You should have received a copy of the GNU LESSER GENERAL PUBLIC LICENSE
#    (LGPL v3) along with this program.
#    If not, see <http://www.gnu.org/licenses/>.
################################################################################
from odoo import models, fields


class ProductTemplate(models.Model):
    _inherit = "product.template"

    free_combo_count = fields.Integer(
        string="Free Choices Count",
        default=2,
        help="First N combo choices selected by customer will be free"
    )

class ProductProduct(models.Model):
    _inherit = "product.product"

    free_combo_count = fields.Integer(
        related="product_tmpl_id.free_combo_count",
        store=True
    )

    def _get_product_for_ui(self, pos_config):
        self.ensure_one()
        product = super()._get_product_for_ui(pos_config)

        product["free_combo_count"] = self.free_combo_count
        return product