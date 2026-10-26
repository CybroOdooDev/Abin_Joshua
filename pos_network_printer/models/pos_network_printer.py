# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
import subprocess
import shutil
import logging

_logger = logging.getLogger(__name__)


class PosNetworkPrinter(models.Model):
    _name = 'pos.network.printer'
    _description = 'POS Network / QZ Tray Printer'
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
        default='both',
    )
    active = fields.Boolean(default=True)

    @api.model
    def register_printers(self, printer_names):
        """Registers a list of printer names discovered from QZ Tray or local spooler."""
        if not printer_names:
            return []
        if isinstance(printer_names, str):
            printer_names = [printer_names]

        registered_ids = []
        for name in printer_names:
            if not name or not isinstance(name, str):
                continue
            clean_name = name.strip()
            if not clean_name:
                continue

            existing = self.sudo().with_context(active_test=False).search([('name', '=', clean_name)], limit=1)
            if existing:
                if not existing.active:
                    existing.sudo().write({'active': True})
                registered_ids.append(existing.id)
            else:
                new_printer = self.sudo().create({
                    'name': clean_name,
                    'active': True,
                    'printer_type': 'both',
                    'paper_width': '80mm',
                })
                registered_ids.append(new_printer.id)

        return registered_ids

    @api.model
    def detect_local_system_printers(self):
        """Discovers locally installed printers via OS print spooler (CUPS/lpstat)."""
        found = []
        lpstat_path = shutil.which('lpstat')
        if lpstat_path:
            try:
                output = subprocess.check_output([lpstat_path, '-a'], text=True, timeout=5)
                for line in output.splitlines():
                    parts = line.strip().split()
                    if parts:
                        found.append(parts[0])
            except Exception as e:
                _logger.warning("Error querying lpstat: %s", e)
        return self.register_printers(found)
