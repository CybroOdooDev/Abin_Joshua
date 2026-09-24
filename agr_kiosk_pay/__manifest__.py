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
    'name': 'AGR Kiosk Pay',
    'version': '17.0.1.4.7',
    'category': 'Point Of Sale',
    'summary': 'Show and process payment methods in POS Self-Order Kiosk',
    'description': """
        This module extends the POS Self-Order (Kiosk) flow to:
        - Display available payment methods
        - Allow customer to select a payment method
        - Process payment via custom API (CashSecurity)
    """,
    'author': 'Cybrosys Techno Solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': "https://www.cybrosys.com",
    'depends': ['web', 'point_of_sale', 'pos_restaurant', 'pos_self_order', 'http_routing'],
    'data': [
        'views/pos_config_views.xml'
    ],
    'assets': {
        'pos_self_order.assets': [
            'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
            'agr_kiosk_pay/static/src/scss/kiosk_payment_popup.scss',
            'agr_kiosk_pay/static/src/xml/kiosk_payment_popup.xml',
            'agr_kiosk_pay/static/src/xml/PaymentReceipt.xml',
            'agr_kiosk_pay/static/src/js/PaymentReceipt.js',
            'agr_kiosk_pay/static/src/js/kiosk_payment_popup.js',
            'agr_kiosk_pay/static/src/js/number_page.js',
            'agr_kiosk_pay/static/src/xml/number_page.xml',
        ]
    },

    'license': 'LGPL-3',
    'installable': True,
    'auto_install': False,
    'application': False,
}
