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
    def print_network_receipt_from_ui(self, order_id, image_base64, printer_id=None):
        """
        Invoked from POS frontend (or Kiosk) upon order completion or manual reprint.
        1. Finds target network printer.
        2. Converts image snapshot to ESC/POS raster and prints via socket.
        3. Saves an exact snapshot in pos.printed.ticket history.
        """
        order = self.browse(order_id)
        if not order.exists():
            return {'success': False, 'message': _("Order not found.")}

        # Resolve printer
        printer = None
        if printer_id:
            printer = self.env['pos.network.printer'].browse(printer_id)
        if not printer or not printer.exists():
            printer = order.config_id.network_printer_id

        if not printer:
            return {
                'success': False,
                'message': _("No network printer configured for this POS."),
            }

        if not image_base64:
            return {'success': False, 'message': _("No receipt image data provided.")}

        # Send to printer
        success, message = printer.print_image(image_base64, cut=True, drawer=False)

        # Log to ticket history
        is_reprint = bool(order.printed_ticket_ids)
        ticket_record = self.env['pos.printed.ticket'].create({
            'name': order.tracking_number or order.pos_reference or order.name,
            'order_id': order.id,
            'printer_id': printer.id,
            'printer_name': printer.name,
            'printer_ip': f"{printer.ip_address}:{printer.port}",
            'print_type': 'reprint' if is_reprint else 'first_print',
            'receipt_snapshot': image_base64,
            'status': 'success' if success else 'failed',
            'error_message': message if not success else False,
        })

        return {
            'success': success,
            'message': message,
            'ticket_id': ticket_record.id,
            'printer_name': printer.name,
        }

    def action_reprint_ticket(self):
        """Backend button action to reprint the order's most recent ticket."""
        self.ensure_one()
        latest_ticket = self.printed_ticket_ids.filtered(lambda t: t.receipt_snapshot)[:1]
        if not latest_ticket:
            raise UserError(_("No recorded ticket snapshot found for order %s to reprint.") % self.name)
        return latest_ticket.action_reprint()
