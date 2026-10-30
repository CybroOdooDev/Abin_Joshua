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
    'name': 'POS Local Ticket Printing System (QZ Tray)',
    'version': '17.0.1.0.3',
    'category': 'Point Of Sale',
    'summary': 'Direct local thermal ticket printing for POS receipts, bills, and legal invoices via QZ Tray',
    'description': """
        Local Ticket Printing System for Odoo 17 POS:
        ======================================================
        - Direct printing to local thermal receipt printers via QZ Tray without IoT Box.
        - Works across cloud deployments (no public/private IP routing issues).
        - Preserves 100% of the POS ticket layout and styling using high-fidelity 80mm raster capture.
        - Full Spanish Veri*Factu and Formal Invoice (Factura Completa) support.
        - Records a complete history and visual snapshot of every printed ticket.
        - Allows exact reprinting of historical tickets from POS Ticket Screen.
    """,
    'author': 'Cybrosys Techno Solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': 'https://www.cybrosys.com',
    'depends': ['point_of_sale', 'pos_restaurant', 'pos_self_order', 'pos_kiosk_enhancements'],
    'data': [
        'security/ir.model.access.csv',
        'data/report_paperformat_data.xml',
        'report/report_invoice_ticket_templates.xml',
        'report/report_invoice_ticket_actions.xml',
        'report/report_cash_closing_templates.xml',
        'report/report_cash_closing_actions.xml',
        'views/account_move_views.xml',
        'views/pos_printed_ticket_views.xml',
        'views/pos_config_views.xml',
        'views/pos_order_views.xml',
        'views/pos_network_printer_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'web_editor/static/lib/html2canvas.js',
            'pos_network_printer/static/src/css/thermal_receipt.css',
            'pos_network_printer/static/src/js/QZPrinterService.js',
            'pos_network_printer/static/src/js/ThermalReceiptHelper.js',
            'pos_network_printer/static/src/js/ReceiptScreenPatch.js',
            'pos_network_printer/static/src/js/TicketScreenPatch.js',
            'pos_network_printer/static/src/js/PrintBillPatch.js',
            'pos_network_printer/static/src/js/PosStorePatch.js',
            'pos_network_printer/static/src/js/OrderPatch.js',
            'pos_network_printer/static/src/js/ReportServicePatch.js',
            'pos_network_printer/static/src/xml/OrderReceiptInvoice.xml',
            'pos_network_printer/static/src/xml/ReceiptScreenDownloadInvoice.xml',
            'pos_network_printer/static/src/xml/KitchenOrderReceipt.xml',
            'pos_network_printer/static/src/js/KitchenOrderReceipt.js',
            'pos_network_printer/static/src/js/KitchenPrintingPatch.js',
            'pos_network_printer/static/src/xml/CashClosingReceipt.xml',
            'pos_network_printer/static/src/js/CashClosingReceipt.js',
            'pos_network_printer/static/src/xml/ClosePosPopupPatch.xml',
            'pos_network_printer/static/src/js/ClosePosPopupPatch.js',
        ],
        'pos_self_order.assets': [
            'pos_network_printer/static/src/css/thermal_receipt.css',
            'pos_network_printer/static/src/js/ThermalReceiptHelper.js',
            'pos_network_printer/static/src/js/KioskConfirmationPatch.js',
        ],
    },
    'license': 'LGPL-3',
    'installable': True,
    'application': False,
    'auto_install': False,
}
