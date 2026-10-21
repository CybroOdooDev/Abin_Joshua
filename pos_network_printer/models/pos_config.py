# -*- coding: utf-8 -*-
from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    enable_network_printing = fields.Boolean(
        string='Enable Local Printing (QZ Tray)',
        default=True,
        help='Enables direct local printing to thermal receipt printers via QZ Tray without IoT Box',
    )
    qz_printer_name = fields.Char(
        string='Receipt Printer Name (QZ Tray)',
        default='POS-80',
        help='Exact name of the printer in QZ Tray (e.g. Bitaspain, POS-80). Leave blank to use system default printer.',
    )
    auto_print_on_payment = fields.Boolean(
        string='Auto-Print Receipt After Payment',
        default=True,
        help='Automatically sends customer receipt to QZ Tray when order is paid',
    )

    def _get_self_ordering_data(self):
        """Export local printer configuration to POS Self-Order / Kiosk."""
        data = super()._get_self_ordering_data()
        data["config"]["enable_network_printing"] = self.enable_network_printing
        data["config"]["auto_print_on_payment"] = self.auto_print_on_payment
        data["config"]["qz_printer_name"] = self.qz_printer_name or self.printer_name or ""
        return data
