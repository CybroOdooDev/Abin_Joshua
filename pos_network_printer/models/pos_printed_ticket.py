# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)


class PosPrintedTicket(models.Model):
    _name = 'pos.printed.ticket'
    _description = 'POS Printed Ticket History'
    _order = 'print_date desc, id desc'

    name = fields.Char(
        string='Ticket Identifier',
        required=True,
        index=True,
        help='Order reference or tracking number',
    )
    order_id = fields.Many2one(
        'pos.order',
        string='POS Order',
        required=True,
        ondelete='cascade',
        index=True,
    )
    session_id = fields.Many2one(
        'pos.session',
        string='POS Session',
        related='order_id.session_id',
        store=True,
    )
    pos_reference = fields.Char(
        string='POS Receipt Ref',
        related='order_id.pos_reference',
        store=True,
    )
    printer_id = fields.Many2one(
        'pos.network.printer',
        string='Network Printer',
        ondelete='set null',
    )
    printer_name = fields.Char(string='Printer Name', readonly=True)
    printer_ip = fields.Char(string='Printer IP:Port', readonly=True)

    print_date = fields.Datetime(
        string='Print Date & Time',
        default=fields.Datetime.now,
        required=True,
        readonly=True,
    )
    user_id = fields.Many2one(
        'res.users',
        string='Cashier / User',
        default=lambda self: self.env.user,
        readonly=True,
    )
    print_type = fields.Selection(
        [
            ('first_print', 'Original Ticket'),
            ('reprint', 'Reprint'),
        ],
        string='Print Type',
        default='first_print',
        required=True,
    )
    reprint_count = fields.Integer(string='Reprint Times', default=0)

    receipt_snapshot = fields.Text(
        string='Original Receipt Snapshot',
        help='Preserved high-resolution image base64 snapshot of the original ticket',
    )
    status = fields.Selection(
        [
            ('success', 'Printed Successfully'),
            ('failed', 'Print Failed'),
        ],
        string='Print Status',
        default='success',
        required=True,
    )
    error_message = fields.Text(string='Error Diagnostic')

    def action_reprint(self):
        """
        Reprints this exact ticket to the network printer, preserving the
        original ticket layout and format.
        """
        self.ensure_one()
        if not self.receipt_snapshot:
            raise UserError(_("No visual snapshot is available for this ticket to reprint."))

        # Find printer: target printer, or fall back to POS config printer
        printer = self.printer_id
        if not printer:
            printer = self.order_id.config_id.network_printer_id
        if not printer:
            raise UserError(_("No network printer configured to reprint this ticket."))

        success, message = printer.print_image(self.receipt_snapshot, cut=True, drawer=False)

        # Log this reprint action as a new history record
        self.env['pos.printed.ticket'].create({
            'name': f"{self.name} (Reprint #{self.reprint_count + 1})",
            'order_id': self.order_id.id,
            'printer_id': printer.id,
            'printer_name': printer.name,
            'printer_ip': f"{printer.ip_address}:{printer.port}",
            'print_type': 'reprint',
            'receipt_snapshot': self.receipt_snapshot,
            'status': 'success' if success else 'failed',
            'error_message': message if not success else False,
        })
        self.reprint_count += 1

        if not success:
            raise UserError(_("Reprint failed: %s") % message)

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Ticket Reprinted'),
                'message': _('Original ticket reprinted on %s (%s).') % (
                    printer.name, printer.ip_address
                ),
                'type': 'success',
                'sticky': False,
            },
        }
