# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError
import logging
from ..utils.escpos_raster import generate_kitchen_ticket
from ..utils.network_socket import send_raw_to_printer

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
    def print_network_receipt_from_ui(self, order_id, image_base64, printer_id=None, print_type='first_print'):
        """
        Invoked from POS frontend (or Kiosk) upon order completion, pre-bill print, or manual reprint.
        1. Finds target network printer.
        2. Converts image snapshot to ESC/POS raster and prints via socket.
        3. Saves an exact snapshot in pos.printed.ticket history.
        """
        order = self.browse(order_id) if (order_id and isinstance(order_id, int) and order_id > 0) else self.env['pos.order']
        if order and not order.exists():
            order = self.env['pos.order']

        # Resolve printer
        printer = None
        if printer_id:
            printer = self.env['pos.network.printer'].browse(printer_id)
        if not printer or not printer.exists():
            printer = order.config_id.network_printer_id if order and order.config_id else None
        if not printer or not printer.exists():
            # Fallback to the first available active printer in system
            printer = self.env['pos.network.printer'].search([], limit=1)

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
        is_reprint = bool(order and order.printed_ticket_ids)
        ticket_type = print_type or ('reprint' if is_reprint else 'first_print')
        ticket_name = (order.tracking_number or order.pos_reference or order.name) if order else _("Pre-Payment Bill")
        if ticket_type == 'bill':
            ticket_name = f"{ticket_name} (Pro-Forma)"
        elif ticket_type == 'invoice':
            ticket_name = f"{ticket_name} (Factura)"

        ticket_record = self.env['pos.printed.ticket'].create({
            'name': ticket_name,
            'order_id': order.id if order else False,
            'printer_id': printer.id,
            'printer_name': printer.name,
            'printer_ip': f"{printer.ip_address}:{printer.port}",
            'print_type': ticket_type,
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

    def _print_kitchen_network_ticket(self):
        """
        Prints a dedicated kitchen preparation ticket to the configured Kitchen Network Printer.
        Formatted specifically for kitchen/bar readability.
        """
        self.ensure_one()
        kitchen_printer = self.config_id.kitchen_network_printer_id
        if not kitchen_printer:
            _logger.info("No kitchen network printer configured for POS config %s", self.config_id.name)
            return False

        # Generate ESC/POS kitchen ticket payload
        ticket_payload = generate_kitchen_ticket(self, paper_width=kitchen_printer.paper_width)
        success, message = send_raw_to_printer(
            kitchen_printer.ip_address,
            kitchen_printer.port,
            ticket_payload,
            timeout=kitchen_printer.connection_timeout
        )

        # Record in printed ticket history
        self.env['pos.printed.ticket'].create({
            'name': f"Kitchen - Order #{self.tracking_number or self.name}",
            'order_id': self.id,
            'printer_id': kitchen_printer.id,
            'printer_name': kitchen_printer.name,
            'printer_ip': f"{kitchen_printer.ip_address}:{kitchen_printer.port}",
            'print_type': 'kitchen',
            'status': 'success' if success else 'failed',
            'error_message': message if not success else False,
        })

        if success:
            _logger.info("Kitchen preparation ticket sent to %s for order %s", kitchen_printer.name, self.name)
        else:
            _logger.warning("Failed to print kitchen ticket for order %s: %s", self.name, message)

        return success

    @api.model
    def create_from_ui(self, orders, draft=False):
        """Hook into order creation from UI to auto-print kitchen tickets when sent to kitchen."""
        res = super().create_from_ui(orders, draft)
        for order_payload, order_result in zip(orders, res):
            order = self.browse(order_result["id"])
            if not order.exists() or not order.config_id.enable_network_printing:
                continue

            # Check if kitchen printer is configured
            if order.config_id.kitchen_network_printer_id:
                data = order_payload.get("data", {})
                if data.get("send_to_kitchen") or any(l.get("customer_note") or l.get("plating_level_id") for l in data.get("lines", [])):
                    try:
                        order._print_kitchen_network_ticket()
                    except Exception as e:
                        _logger.error("Error auto-printing kitchen ticket for order %s: %s", order.name, e)
        return res

    def action_reprint_ticket(self):
        """Backend button action to reprint the order's most recent ticket."""
        self.ensure_one()
        latest_ticket = self.printed_ticket_ids.filtered(lambda t: t.receipt_snapshot)[:1]
        if not latest_ticket:
            raise UserError(_("No recorded ticket snapshot found for order %s to reprint.") % self.name)
        return latest_ticket.action_reprint()
