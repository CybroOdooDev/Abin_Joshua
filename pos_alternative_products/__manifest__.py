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
    'name': 'Alternative Products in Pos',
    'version': '19.5.1.0.0',
    'category': 'Point of Sale',
    'summary': """We can select alternative product , when a product have 
     zero available quantity in pos.""",
    'description': """This module helps to choose the alternative product if
     the selected product's available quantity is less than or equal to zero.
    """,
    'author': 'Cybrosys Techno Solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': 'https://www.cybrosys.com',
    'depends': ['point_of_sale', 'pos_sale', 'stock', 'website', 'website_sale'],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_alternative_products/static/src/js/ProductScreen.js',
            'pos_alternative_products/static/src/js/AlternativeProductPopup.js',
            'pos_alternative_products/static/src/xml/alternative_pop_up_templates.xml',
            'pos_alternative_products/static/src/js/pos_session.js'
        ],
    },
    'images': ['static/description/banner.jpg'],
    'license': 'LGPL-3',
    'installable': True,
    'auto_install': False,
    'application': False,
}
