# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class PosConfig(models.Model):
    _inherit = 'pos.config'

    enable_network_printing = fields.Boolean(
        string='Enable Local Printing (QZ Tray)',
        default=True,
        help='Enables direct local printing to thermal receipt printers via QZ Tray without IoT Box',
    )
    qz_printer_id = fields.Many2one(
        'pos.network.printer',
        string='Receipt Printer (QZ Tray)',
        domain="[('printer_type', 'in', ['receipt', 'both'])]",
        help='Select receipt printer detected via QZ Tray or local system.',
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
    qz_kitchen_printer_id = fields.Many2one(
        'pos.network.printer',
        string='Kitchen Printer (QZ Tray)',
        domain="[('printer_type', 'in', ['kitchen', 'both'])]",
        help='Select kitchen preparation printer detected via QZ Tray or local system.',
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

    @api.onchange('qz_printer_id')
    def _onchange_qz_printer_id(self):
        if self.qz_printer_id:
            self.qz_printer_name = self.qz_printer_id.name

    @api.onchange('qz_kitchen_printer_id')
    def _onchange_qz_kitchen_printer_id(self):
        if self.qz_kitchen_printer_id:
            self.qz_kitchen_printer_name = self.qz_kitchen_printer_id.name

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('qz_printer_id'):
                printer = self.env['pos.network.printer'].browse(vals['qz_printer_id'])
                if printer.exists():
                    vals['qz_printer_name'] = printer.name
            elif vals.get('qz_printer_name'):
                printer = self.env['pos.network.printer'].search([('name', '=', vals['qz_printer_name'].strip())], limit=1)
                if printer:
                    vals['qz_printer_id'] = printer.id

            if vals.get('qz_kitchen_printer_id'):
                printer = self.env['pos.network.printer'].browse(vals['qz_kitchen_printer_id'])
                if printer.exists():
                    vals['qz_kitchen_printer_name'] = printer.name
            elif vals.get('qz_kitchen_printer_name'):
                printer = self.env['pos.network.printer'].search([('name', '=', vals['qz_kitchen_printer_name'].strip())], limit=1)
                if printer:
                    vals['qz_kitchen_printer_id'] = printer.id
        return super().create(vals_list)

    def write(self, vals):
        if 'qz_printer_id' in vals:
            if vals['qz_printer_id']:
                printer = self.env['pos.network.printer'].browse(vals['qz_printer_id'])
                if printer.exists():
                    vals['qz_printer_name'] = printer.name
            else:
                vals['qz_printer_name'] = False
        elif 'qz_printer_name' in vals and vals['qz_printer_name']:
            printer = self.env['pos.network.printer'].search([('name', '=', vals['qz_printer_name'].strip())], limit=1)
            if printer:
                vals['qz_printer_id'] = printer.id

        if 'qz_kitchen_printer_id' in vals:
            if vals['qz_kitchen_printer_id']:
                printer = self.env['pos.network.printer'].browse(vals['qz_kitchen_printer_id'])
                if printer.exists():
                    vals['qz_kitchen_printer_name'] = printer.name
            else:
                vals['qz_kitchen_printer_name'] = False
        elif 'qz_kitchen_printer_name' in vals and vals['qz_kitchen_printer_name']:
            printer = self.env['pos.network.printer'].search([('name', '=', vals['qz_kitchen_printer_name'].strip())], limit=1)
            if printer:
                vals['qz_kitchen_printer_id'] = printer.id

        return super().write(vals)

    def action_find_system_printers(self):
        """Scans local system printers (CUPS/spooler) and registers them."""
        self.env['pos.network.printer'].detect_local_system_printers()

        if self.qz_printer_name:
            self.env['pos.network.printer'].register_printers(self.qz_printer_name)
            if not self.qz_printer_id:
                p = self.env['pos.network.printer'].search([('name', '=', self.qz_printer_name.strip())], limit=1)
                if p:
                    self.qz_printer_id = p.id

        if self.qz_kitchen_printer_name:
            self.env['pos.network.printer'].register_printers(self.qz_kitchen_printer_name)
            if not self.qz_kitchen_printer_id:
                p = self.env['pos.network.printer'].search([('name', '=', self.qz_kitchen_printer_name.strip())], limit=1)
                if p:
                    self.qz_kitchen_printer_id = p.id

        all_printers = self.env['pos.network.printer'].search([])
        names = all_printers.mapped('name')
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Printers Discovered'),
                'message': _('Available printers: %s') % (', '.join(names) if names else _('None detected')),
                'type': 'success',
                'sticky': False,
            },
        }

    def _get_self_ordering_data(self):
        """Export local printer configuration to POS Self-Order / Kiosk."""
        data = super()._get_self_ordering_data()
        data["config"]["enable_network_printing"] = self.enable_network_printing
        data["config"]["auto_print_on_payment"] = self.auto_print_on_payment
        data["config"]["qz_printer_id"] = [self.qz_printer_id.id, self.qz_printer_id.name] if self.qz_printer_id else False
        data["config"]["qz_printer_name"] = self.qz_printer_id.name or self.qz_printer_name or self.printer_name or ""
        data["config"]["enable_kitchen_printing"] = self.enable_kitchen_printing
        data["config"]["qz_kitchen_printer_id"] = [self.qz_kitchen_printer_id.id, self.qz_kitchen_printer_id.name] if self.qz_kitchen_printer_id else False
        data["config"]["qz_kitchen_printer_name"] = self.qz_kitchen_printer_id.name or self.qz_kitchen_printer_name or ""
        data["config"]["simulation_mode"] = self.simulation_mode
        return data
