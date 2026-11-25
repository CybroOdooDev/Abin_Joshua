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
from odoo import fields, models


class ProductProduct(models.Model):
    """Add PrestaShop tracking fields to product variants."""

    _inherit = 'product.product'

    prestashop = fields.Integer(
        string="PrestaShop ID",
        copy=False,
        help="PrestaShop identifier of the product.",
    )
    is_delivery_product = fields.Boolean(
        string="PrestaShop Delivery Product",
        help="Identify whether the product represents PrestaShop delivery charges.",
    )
    is_discount_product = fields.Boolean(
        string="PrestaShop Discount Product",
        help="Identify whether the product represents PrestaShop order discounts.",
    )
