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


class SaleOrderLine(models.Model):
    """This class inherits "sale.order.line" and adds fields discount,
     total_discount """
    _inherit = "sale.order.line"

    discount = fields.Float(string='Discount (%)', digits=(16, 20), default=0.0,
                            help="Discount needed.")
    total_discount = fields.Float(string="Total Discount", default=0.0,
                                  store=True, help="Total discount can be"
                                                   "specified here.")
