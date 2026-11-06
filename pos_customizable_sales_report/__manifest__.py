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
#    You should have received a copy of the GNU LESSER GENERAL PUBLIC LICENSE
#    (LGPL v3) along with this program.
#    If not, see <http://www.gnu.org/licenses/>.
#
#############################################################################
{
    'name': 'POS Customizable Sales Report',
    'version': '17.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Customizable POS Sales Reports with Hierarchical Combo Breakdown, Dual Revenue Attribution, and Multi-Rate VAT Calculations',
    'description': """
POS Customizable Sales Report
=============================
This module provides advanced, customizable sales reporting for Odoo 17 Point of Sale:
* **Hierarchical Combo / Menu Breakdown**: Displays parent combo products with their nested, chosen sub-products indented directly underneath with quantities and add-on charges.
* **Dual Revenue Attribution (User-Selectable)**:
    - Menu-level Revenue: Main combo retains base price while sub-products track consumption quantities.
    - Prorated Revenue: The menu price is distributed proportionally to individual components according to their list prices.
* **Cross-Category Filtering**: When filtering by categories (e.g. Drinks), captures both standalone products and items chosen inside combo meals.
* **Customizable Filters**: Date/time ranges, POS configurations, sessions, categories, individual products, min/max price range, and discount filters.
* **Accurate Multi-Rate VAT**: Clean breakdown of Net Sales (Excl. VAT), Total VAT (by tax rate: 4%, 10%, 21%), and Gross Sales (Incl. VAT).
* **Multi-Format Export**: Professional QWeb PDF reports and Excel (XLSX) spreadsheets.
    """,
    'author': 'Cybrosys Techno Solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': 'https://www.cybrosys.com',
    'depends': ['point_of_sale'],
    'data': [
        'security/ir.model.access.csv',
        'report/report_customizable_sales_actions.xml',
        'report/report_customizable_sales_templates.xml',
        'wizard/pos_customizable_sales_report_wizard_views.xml',
        'views/menu_views.xml',
    ],
    'license': 'LGPL-3',
    'installable': True,
    'auto_install': False,
    'application': False,
}

