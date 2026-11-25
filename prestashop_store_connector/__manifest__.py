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
    'name': 'Prestashop Connector',
    'version': '20.0.1.0.0',
    'category': 'Productivity',
    'summary': 'Connect Odoo 20 with PrestaShop stores to import and export products, contacts, and sales orders.',
    'author': 'Cybrosys Techno Solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': 'https://www.cybrosys.com',
    'depends': ['product', 'sale', 'stock', 'delivery'],
    'data': [
        'security/ir.access.csv',
        'views/prestashop_connector_views.xml',
        'views/product_product_views.xml',
        'views/res_partner_views.xml',
        'views/sale_order_views.xml',
        'views/prestashop_store_connector_menus.xml',
    ],
    'external_dependencies': {
        'python': ['prestapyt'],
    },
    'images': ['static/description/banner.jpg'],
    'license': 'LGPL-3',
    'application': True,
}
