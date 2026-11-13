# -- coding: utf-8 --
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
{
    'name': 'POS Restaurant Customizable Decor & Surrounding Tables',
    'version': '17.0.1.2.1',
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
        'security/ir.model.access.csv',
        'views/restaurant_table_views.xml',
        'views/restaurant_decor_image_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_restaurant_decorations/static/src/css/decorations.css',
            'pos_restaurant_decorations/static/src/js/decor_presets.js',
            'pos_restaurant_decorations/static/src/js/decor_storage.js',
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
