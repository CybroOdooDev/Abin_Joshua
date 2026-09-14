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
from odoo.tools import SQL


class DiscountSaleReport(models.Model):
    """This class inherits 'sale.report' and adds field discount"""
    _inherit = 'sale.report'

    discount = fields.Float('Discount', readonly=True,
                            help="Specify the discount amount.")

    def _select(self) -> SQL:
        """It extends the behavior of a method in the class by adding a
            new column, discount, to the SQL query. This new column represents
            the total discount for sales transactions, calculated based on
            various factors and values related to the sale. """
        return SQL(
            "%s, sum(l.product_uom_qty / u.factor * u2.factor * cr.rate * l.price_unit * l.discount / 100.0) as discount",
            super()._select())
