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
    'name': 'Hide Filters GroupBy',
    'version': '19.5.1.0.0',
    'category': 'Extra Tools',
    'summary': 'Hide Filters GroupBy Helps You to Hide Filter And'
               ' GroupBy Option.',
    'description': 'Hide Filters GroupBy Helps you to Hide Filter and'
                   ' Group by Option on the Basis of Globally or Custom. On '
                   'Choosing Option Globally Filter and Group by Option of'
                   ' all Models will be Hide and on Choosing Option Custom,'
                   ' Filter and Group by Option of all Selected Models will'
                   ' be Hidden.',
    'author': 'Cybrosys Techno solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': "https://www.cybrosys.com",
    'depends': ['base_setup','web'],
    'data': [
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'hide_filters_groupby/static/src/js/control_panel.js',
        ],
    },
    'images': ['static/description/banner.jpg'],
    'license': 'AGPL-3',
    'installable': True,
    'auto_install': False,
    'application': False,
}
