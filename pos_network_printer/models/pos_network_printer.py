# -*- coding: utf-8 -*-
from odoo import fields, models


class PosNetworkPrinter(models.Model):
    _name = 'pos.network.printer'
    _description = 'POS Local Network Printer (Deprecated - Use QZ Tray)'
    _order = 'name asc'

    name = fields.Char(string='Printer Name', required=True)
    ip_address = fields.Char(string='IP Address / Hostname')
    port = fields.Integer(string='TCP Port', default=9100)
    paper_width = fields.Selection(
        [
            ('80mm', '80 mm (Standard - 576 dots)'),
            ('58mm', '58 mm (Compact - 384 dots)'),
        ],
        string='Paper Width',
        default='80mm',
    )
    printer_type = fields.Selection(
        [
            ('receipt', 'Customer Receipt Printer'),
            ('kitchen', 'Kitchen / Preparation Printer'),
            ('both', 'Receipt & Kitchen Printer'),
        ],
        string='Printer Role',
        default='receipt',
    )
    active = fields.Boolean(default=False)
