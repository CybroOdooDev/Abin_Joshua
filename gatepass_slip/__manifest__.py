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
{
    'name': 'Delivery Gate Pass',
    'version': '19.5.1.0.0',
    'category': 'Warehouse',
    'summary': """Generating Gate pass slip in delivery orders""",
    'description': """This module facilitates the creation of gate pass slips 
     for users, which can be used as a pass to let a vehicle 
     into a facility. The slips allow for the addition of 
     driver and vehicle-related information.""",
    'author': 'Cybrosys Techno Solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': 'https://www.cybrosys.com',
    'depends': ['base', 'stock'],
    'data': [
        'views/stock_picking_views.xml',
        'report/stock_picking_templates.xml',
        'report/stock_picking_reports.xml',
    ],
    'images': ['static/description/banner.jpg'],
    'license': 'LGPL-3',
    'installable': True,
    'application': False,
    'auto_install': False,
}
