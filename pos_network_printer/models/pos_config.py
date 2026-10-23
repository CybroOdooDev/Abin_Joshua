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
        help='Exact name of the receipt printer in QZ Tray (e.g. Bitaspain, POS-80). Leave blank to use system default printer.',
    )
    auto_print_on_payment = fields.Boolean(
        string='Auto-Print Receipt After Payment',
        default=True,
        help='Automatically sends customer receipt to QZ Tray when order is paid',
    )
    enable_kitchen_printing = fields.Boolean(
        string='Enable Kitchen Printing (QZ Tray)',
        default=True,
        help='Automatically sends food orders to kitchen printer via QZ Tray when sent to kitchen display',
    )
    qz_kitchen_printer_name = fields.Char(
        string='Kitchen Printer Name (QZ Tray)',
        default='',
        help='Exact name of the kitchen printer in QZ Tray (e.g. Kitchen, POS-80-Kitchen). Leave blank to use Receipt Printer.',
    )
    simulation_mode = fields.Boolean(
        string='Simulation Mode (Skip Physical Printing)',
        default=False,
        help='When enabled, saves ticket snapshots to backend history without sending to physical printer.',
    )

    def _get_self_ordering_data(self):
        """Export local printer configuration to POS Self-Order / Kiosk."""
        data = super()._get_self_ordering_data()
        data["config"]["enable_network_printing"] = self.enable_network_printing
        data["config"]["auto_print_on_payment"] = self.auto_print_on_payment
        data["config"]["qz_printer_name"] = self.qz_printer_name or self.printer_name or ""
        data["config"]["enable_kitchen_printing"] = self.enable_kitchen_printing
        data["config"]["qz_kitchen_printer_name"] = self.qz_kitchen_printer_name or ""
        data["config"]["simulation_mode"] = self.simulation_mode
        return data
