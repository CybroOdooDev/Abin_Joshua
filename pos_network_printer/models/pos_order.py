# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = 'pos.order'

    printed_ticket_ids = fields.One2many(
        'pos.printed.ticket',
        'order_id',
        string='Printed Tickets History',
        readonly=True,
    )
    printed_ticket_count = fields.Integer(
        string='Print Count',
        compute='_compute_printed_ticket_count',
    )

    @api.depends('printed_ticket_ids')
    def _compute_printed_ticket_count(self):
        for order in self:
            order.printed_ticket_count = len(order.printed_ticket_ids)

    @api.model
    def create_from_ui(self, orders, draft=False):
        """Augment create_from_ui to return account_move_name for formal invoice printing."""
        res = super().create_from_ui(orders, draft=draft)
        for order_data in res:
            if order_data.get('account_move'):
                move = self.env['account.move'].browse(order_data['account_move'])
                order_data['account_move_name'] = move.name or False
        return res

    @api.model
    def get_order_invoice_info(self, server_order_id):
        """Helper to resolve invoice sequence number for formal invoice tickets."""
        order = self.browse(server_order_id)
        if order.exists() and order.account_move:
            return {
                'invoice_id': order.account_move.id,
                'invoice_number': order.account_move.name or '',
            }
        return {'invoice_id': False, 'invoice_number': ''}

    @api.model
    def log_printed_ticket(self, order_id, image_base64, print_type='first_print', printer_name='', status='success', error_message=False, custom_name=False, **kwargs):
        """
        Invoked from POS frontend upon ticket print via QZ Tray.
        Records an exact visual snapshot and audit record in pos.printed.ticket history.
        """
        order = self.browse(order_id) if (order_id and isinstance(order_id, int) and order_id > 0) else self.env['pos.order']
        if order and not order.exists():
            order = self.env['pos.order']

        if custom_name:
            ticket_name = str(custom_name)
        else:
            ticket_name = (order.tracking_number or order.pos_reference or order.name) if order else _("Ticket")

        if print_type == 'bill':
            ticket_name = f"{ticket_name} (Pro-Forma)"
        elif print_type == 'invoice':
            ticket_name = f"{ticket_name} (Factura)"
        elif print_type == 'reprint':
            ticket_name = f"{ticket_name} (Copia)"
        elif print_type == 'kitchen':
            ticket_name = f"{ticket_name} (Cocina)"

        ticket_record = self.env['pos.printed.ticket'].create({
            'name': ticket_name,
            'order_id': order.id if order else False,
            'printer_name': printer_name or 'QZ Tray',
            'print_type': print_type or 'first_print',
            'receipt_snapshot': image_base64,
            'status': status or 'success',
            'error_message': error_message or False,
        })

        return {
            'success': True,
            'ticket_id': ticket_record.id,
            'printer_name': printer_name,
        }

    @api.model
    def print_network_receipt_from_ui(self, order_id, image_base64, printer_id=None, print_type='first_print'):
        """Backward-compatibility alias for log_printed_ticket."""
        return self.log_printed_ticket(
            order_id=order_id,
            image_base64=image_base64,
            print_type=print_type,
            printer_name='',
            status='success' if image_base64 else 'failed',
        )

    @api.model
    def get_latest_ticket_snapshot(self, order_id):
        """Returns the most recent valid receipt snapshot for exact reprinting."""
        ticket = self.env['pos.printed.ticket'].search([
            ('order_id', '=', order_id),
            ('receipt_snapshot', '!=', False)
        ], limit=1, order='id desc')
        if ticket:
            return {
                'id': ticket.id,
                'name': ticket.name,
                'receipt_snapshot': ticket.receipt_snapshot,
            }
        return False

    def action_print_invoice_ticket_80mm(self):
        """Prints or downloads the 80mm ticket format for the linked invoice."""
        self.ensure_one()
        if self.account_move:
            return self.env.ref('pos_network_printer.report_invoice_ticket_80mm').report_action(self.account_move)
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('No Invoice Found'),
                'message': _('This POS order does not have an invoice generated yet.'),
                'type': 'warning',
                'sticky': False,
            },
        }

    def action_reprint_ticket(self):
        """Prints the 80mm ticket report if invoiced, or notifies user to reprint in POS screen."""
        self.ensure_one()
        if self.account_move:
            return self.action_print_invoice_ticket_80mm()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Reprint from POS'),
                'message': _('To reprint tickets directly to your thermal printer via QZ Tray, open the POS screen and use the "Reprint Receipt" button on the order.'),
                'type': 'info',
                'sticky': False,
            },
        }
