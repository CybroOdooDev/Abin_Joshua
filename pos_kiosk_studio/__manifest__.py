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
    "name": "POS Kiosk Studio (Theme Editor)",
    "version": "17.0.1.2.2",
    "category": "Point of Sale",
    "summary": "Live theme editor for POS Kiosk / Self-Order in Community edition",
    'author': "Cybrosys Techno Solutions",
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': "https://www.cybrosys.com",
    "depends": ["point_of_sale", "pos_self_order", "web"],
    "assets": {
        "pos_self_order.assets": [
            "pos_kiosk_studio/static/src/js/kiosk_storage.js",
            "pos_kiosk_studio/static/src/xml/studio_sidebar.xml",
            "pos_kiosk_studio/static/src/js/self_order.js",
            "pos_kiosk_studio/static/src/js/self_order_index.js",
            "pos_kiosk_studio/static/src/js/studio_sidebar.js",
            "pos_kiosk_studio/static/src/scss/studio_theme.scss",
            "pos_kiosk_studio/static/src/xml/self_order_index_template.xml",
            "pos_kiosk_studio/static/src/xml/product_card.xml"
        ],
    },
    "installable": True,
    "auto_install": False,
    "license": "LGPL-3",
}
