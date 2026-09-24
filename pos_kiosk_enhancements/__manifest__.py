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
    'name': 'POS Kiosk Schedule Control',
    'version': '17.0.1.16.19',
    'category': 'Point Of Sale',
    'summary': 'Configure operating hours for POS Self-Order Kiosk availability',
    'description': """This module adds schedule control for the POS Self-Order (Kiosk).
                Features:
                - Enable or disable kiosk schedule
                - Configure kiosk operating hours (Available From / To)
                - Automatically show "Currently Closed" screen outside allowed hours
                - Prevent unintended kiosk closure during configuration updates
                - New payment method added for Pay at the counter""",
    'author': 'Cybrosys Techno Solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': "https://www.cybrosys.com",
    'depends': ['web', 'point_of_sale', 'pos_self_order', 'pos_self_order_sale', 'agr_kiosk_pay'],
    'data': [
        'security/ir.model.access.csv',
        'data/account_journal_data.xml',
        'data/pos_payment_method_data.xml',
        'views/pos_config_views.xml',
        'views/product_template_views.xml',
        'views/pos_combo_views.xml',
        'views/pos_order_views.xml',
        'views/pos_payment_method.xml',
        'wizard/kiosk_close_session_views.xml',
        'wizard/pos_order_cancel_views.xml',
    ],

    'assets': {
        'pos_self_order.assets': [
            'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
            'pos_kiosk_enhancements/static/src/js/kiosk_schedule.js',
            'pos_kiosk_enhancements/static/src/scss/kiosk_open_screen.scss',
            'pos_kiosk_enhancements/static/src/xml/SelfOrderIndex.xml',
            'pos_kiosk_enhancements/static/src/xml/PaymentReceipt.xml',
            'pos_kiosk_enhancements/static/src/js/FreeToppings.js',
            'pos_kiosk_enhancements/static/src/js/PaymentReceipt.js',
            'pos_kiosk_enhancements/static/src/js/ProductLoad.js',
            'pos_kiosk_enhancements/static/src/js/ComboLoad.js',
            'pos_kiosk_enhancements/static/src/js/ProductList.js',
            'pos_kiosk_enhancements/static/src/xml/ProductList.xml',
            'pos_kiosk_enhancements/static/lib/qz-tray.js',
            'pos_kiosk_enhancements/static/src/js/ComboSelection.js',
            'pos_kiosk_enhancements/static/src/xml/ComboSelection.xml',
            'pos_kiosk_enhancements/static/src/js/ComboPage.js',
            'pos_kiosk_enhancements/static/src/xml/ComboPage.xml',
            'pos_kiosk_enhancements/static/src/js/confirmationPage.js'
        ],
        'point_of_sale._assets_pos': [
            'pos_kiosk_enhancements/static/src/js/BarcodeService.js',
            'pos_kiosk_enhancements/static/src/js/BarcodeScanner.js',
            'pos_kiosk_enhancements/static/src/xml/PosScanPaymentPopup.xml',
            'pos_kiosk_enhancements/static/src/js/PosScanPaymentPopup.js',
            'pos_kiosk_enhancements/static/src/js/order.js',
            'pos_kiosk_enhancements/static/src/js/ProductScreen.js',
            'pos_kiosk_enhancements/static/src/scss/kiosk_open_screen.scss',
            'pos_kiosk_enhancements/static/lib/qz-tray.js',
            'pos_kiosk_enhancements/static/src/js/combo_configurator_popup.js',
            'pos_kiosk_enhancements/static/src/scss/combo_configurator_popup.css',
            'pos_kiosk_enhancements/static/src/xml/combo_configurator_popup.xml',
            'pos_kiosk_enhancements/static/src/js/OrderLine.js',
            'pos_kiosk_enhancements/static/src/js/paymentScreen.js',
            'pos_kiosk_enhancements/static/src/js/ticketScreen.js',
            'pos_kiosk_enhancements/static/src/xml/OrderLine.xml',
            'pos_kiosk_enhancements/static/src/xml/OrderReceipt.xml'
        ],
    },
    'license': 'LGPL-3',
    'installable': True,
    'auto_install': False,
    'application': False,
}
