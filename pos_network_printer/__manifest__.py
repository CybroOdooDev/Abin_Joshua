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
    'name': 'POS Local Network Ticket Printing System',
    'version': '17.0.1.0.0',
    'category': 'Point Of Sale',
    'summary': 'Direct local network printing for POS tickets without IoT Box or ePOS printers',
    'description': """
        Local Network Ticket Printing System for Odoo 17 POS:
        ======================================================
        - Direct printing to standard network thermal printers via RAW TCP/IP (Port 9100).
        - Replaces the need for Odoo IoT Box and expensive ePOS printers.
        - Preserves 100% of the POS ticket layout and styling using high-fidelity ESC/POS raster graphics.
        - Records a complete history and visual snapshot of every printed ticket.
        - Allows exact reprinting of historical tickets from both POS frontend and backend order view.
    """,
    'author': 'Cybrosys Techno Solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': 'https://www.cybrosys.com',
    'depends': ['point_of_sale', 'pos_restaurant', 'pos_self_order'],
    'data': [
        'security/ir.model.access.csv',
        'views/pos_network_printer_views.xml',
        'views/pos_printed_ticket_views.xml',
        'views/pos_config_views.xml',
        'views/pos_order_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'web_editor/static/lib/html2canvas.js',
            'pos_network_printer/static/src/js/NetworkPrinterService.js',
            'pos_network_printer/static/src/js/ReceiptScreenPatch.js',
            'pos_network_printer/static/src/js/TicketScreenPatch.js',
            'pos_network_printer/static/src/js/PrintBillPatch.js',
            'pos_network_printer/static/src/js/OrderPatch.js',
            'pos_network_printer/static/src/xml/OrderReceiptInvoice.xml',
        ],
        'pos_self_order.assets': [
            'pos_network_printer/static/src/js/KioskConfirmationPatch.js',
        ],
    },
    'license': 'LGPL-3',
    'installable': True,
    'application': False,
    'auto_install': False,
}
