# -*- coding: utf-8 -*-
{
    'name': 'POS Restaurant Customizable Decor & Surrounding Tables',
    'version': '17.0.1.1.0',
    'category': 'Point of Sale',
    'summary': 'Customizable surrounding tables, bar items, flowerpots, barrels, chairs and decorations for POS Restaurant',
    'description': """
Customize POS restaurant surrounding tables and floor plans with realistic decorations,
including bar items, flowerpots, barrels, dining tables, chairs, and custom image uploads,
fully responsive on mobile, tablet, and desktop screens.
    """,
    'author': 'Cybrosys Techno Solutions',
    'website': 'https://www.cybrosys.com',
    'depends': ['point_of_sale', 'pos_restaurant'],
    'data': [
        'views/restaurant_table_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_restaurant_decorations/static/src/css/decorations.css',
            'pos_restaurant_decorations/static/src/js/decor_presets.js',
            'pos_restaurant_decorations/static/src/js/decor_preset_popup.js',
            'pos_restaurant_decorations/static/src/js/decor_preset_popup.xml',
            'pos_restaurant_decorations/static/src/js/table_customization_popup.js',
            'pos_restaurant_decorations/static/src/js/table_customization_popup.xml',
            'pos_restaurant_decorations/static/src/js/table.js',
            'pos_restaurant_decorations/static/src/js/table.xml',
            'pos_restaurant_decorations/static/src/js/editable_table.js',
            'pos_restaurant_decorations/static/src/js/editable_table.xml',
            'pos_restaurant_decorations/static/src/js/edit_bar.js',
            'pos_restaurant_decorations/static/src/js/edit_bar.xml',
            'pos_restaurant_decorations/static/src/js/floor_screen.js',
            'pos_restaurant_decorations/static/src/js/floor_screen.xml',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
