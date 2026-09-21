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
    'name': "Low Sales Report",
    'version': '20.0.1.0.0',
    'category': 'Sales',
    'summary': 'The tool to control poorly performing product',
    'description': 'Efficiently manage and analyze low sales with this module,'
                   'offering customizable criteria, flexible reporting '
                   'periods, and versatile presentation options in Odoo or '
                   'Excel. Tailor your analysis by filtering specific product'
                   'categories or sales teams, and choose between '
                   'template-wide insights or focus on individual product '
                   'variants for a comprehensive understanding of '
                   'under performing products.',
    'author': 'Cybrosys Techno Solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': 'https://www.cybrosys.com',
    'depends': ['sale_management', 'crm', 'product', 'mail'],
    'data': [
        'security/ir.access.csv',
        'views/res_config_settings_view.xml',
        'report/low_sale_pivot_view_report_view.xml',
        'wizard/low_sale_report_views.xml'
    ],
    'assets': {
        'web.assets_backend': [
            'low_sale_report/static/src/js/low_sale_xlsx_report.js',
        ],
    },
    'images': ['static/description/banner.jpg'],
    'license': 'AGPL-3',
    'installable': True,
    'auto_install': False,
    'application': False,
}
