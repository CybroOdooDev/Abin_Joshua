# -*- coding: utf-8 -*-
from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    enable_network_printing = fields.Boolean(
        string='Enable Local Network Printing',
        default=True,
        help='Enables direct printing to network thermal receipt printers via TCP port 9100 without IoT Box',
    )
    network_printer_id = fields.Many2one(
        'pos.network.printer',
        string='Receipt Network Printer',
        help='Default network thermal printer for customer receipts',
    )
    kitchen_network_printer_id = fields.Many2one(
        'pos.network.printer',
        string='Kitchen Network Printer',
        help='Network thermal printer for kitchen/bar preparation tickets',
    )
    auto_print_on_payment = fields.Boolean(
        string='Auto-Print Receipt After Payment',
        default=True,
        help='Automatically dispatches customer receipt to network printer when order is paid',
    )

    def _get_self_ordering_data(self):
        """Export network printer configuration to POS Self-Order / Kiosk."""
        data = super()._get_self_ordering_data()
        data["config"]["enable_network_printing"] = self.enable_network_printing
        data["config"]["auto_print_on_payment"] = self.auto_print_on_payment
        if self.network_printer_id:
            data["config"]["network_printer_id"] = self.network_printer_id.id
            data["config"]["network_printer_name"] = self.network_printer_id.name
            data["config"]["network_printer_ip"] = self.network_printer_id.ip_address
            data["config"]["network_printer_port"] = self.network_printer_id.port
        return data
