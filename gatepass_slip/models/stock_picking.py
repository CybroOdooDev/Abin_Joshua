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


class StockPicking(models.Model):
    """Inherit model 'stock.picking' and add required fields """
    _inherit = 'stock.picking'

    is_enable_order_line = fields.Boolean(string='Include Product Details',
                                          default=True,
                                          help="If you want to print the "
                                               "product details in your report"
                                               " enable this field.")
    vehicle_no = fields.Char(string='Vehicle Number',
                             help="Enter the vehicle number.")
    vehicle_driver_name = fields.Char(string='Driver Name',
                                      help="Enter the driver's name.")
    driver_contact_number = fields.Char(string='Contact No',
                                        help="Enter the driver's contact"
                                             " number.")
    corresponding_company = fields.Char(string='Corresponding Company',
                                        help="Enter the corresponding company.")
