# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError
from ..utils.network_socket import send_raw_to_printer, test_printer_connection
from ..utils.escpos_raster import image_to_escpos_raster, generate_test_ticket
import logging

_logger = logging.getLogger(__name__)


class PosNetworkPrinter(models.Model):
    _name = 'pos.network.printer'
    _description = 'POS Local Network Printer'
    _order = 'name asc'

    name = fields.Char(
        string='Printer Name',
        required=True,
        help='Descriptive name (e.g. Counter Thermal Printer, Kitchen Printer)',
    )
    ip_address = fields.Char(
        string='IP Address / Hostname',
        required=True,
        default='192.168.1.100',
        help='Local network IP address of the thermal printer (e.g. 192.168.1.150)',
    )
    port = fields.Integer(
        string='TCP Port',
        required=True,
        default=9100,
        help='RAW thermal printer port (Standard is 9100)',
    )
    paper_width = fields.Selection(
        [
            ('80mm', '80 mm (Standard - 576 dots)'),
            ('58mm', '58 mm (Compact - 384 dots)'),
        ],
        string='Paper Width',
        required=True,
        default='80mm',
        help='Thermal roll paper width',
    )
    printer_type = fields.Selection(
        [
            ('receipt', 'Customer Receipt Printer'),
            ('kitchen', 'Kitchen / Preparation Printer'),
            ('both', 'Receipt & Kitchen Printer'),
        ],
        string='Printer Role',
        default='receipt',
        required=True,
    )
    connection_timeout = fields.Integer(
        string='Timeout (Seconds)',
        default=5,
        help='Maximum seconds to wait for printer socket connection',
    )
    active = fields.Boolean(default=True)

    last_status = fields.Selection(
        [
            ('unknown', 'Not Tested'),
            ('online', 'Online & Reachable'),
            ('offline', 'Offline / Unreachable'),
        ],
        string='Network Status',
        default='unknown',
        readonly=True,
    )
    last_status_message = fields.Text(string='Diagnostic Status', readonly=True)
    last_checked = fields.Datetime(string='Last Tested On', readonly=True)

    def action_test_connection(self):
        """Pings the printer TCP port and updates connection status."""
        self.ensure_one()
        reachable, message = test_printer_connection(
            self.ip_address, self.port, timeout=self.connection_timeout
        )
        self.write({
            'last_status': 'online' if reachable else 'offline',
            'last_status_message': message,
            'last_checked': fields.Datetime.now(),
        })

        if reachable:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Connection Successful'),
                    'message': message,
                    'type': 'success',
                    'sticky': False,
                },
            }
        else:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Connection Failed'),
                    'message': message,
                    'type': 'danger',
                    'sticky': True,
                },
            }

    def action_print_test_page(self):
        """Prints a physical self-test ticket on the network thermal printer."""
        self.ensure_one()
        test_payload = generate_test_ticket(
            self.name, self.ip_address, self.port, self.paper_width
        )
        success, message = send_raw_to_printer(
            self.ip_address, self.port, test_payload, timeout=self.connection_timeout
        )
        self.write({
            'last_status': 'online' if success else 'offline',
            'last_status_message': message,
            'last_checked': fields.Datetime.now(),
        })

        if not success:
            raise UserError(_("Test print failed: %s") % message)

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Test Ticket Sent'),
                'message': _('Test ticket successfully dispatched to %s (%s:%s).') % (
                    self.name, self.ip_address, self.port
                ),
                'type': 'success',
                'sticky': False,
            },
        }

    def print_image(self, image_data, cut=True, drawer=False):
        """
        Converts image data to raster ESC/POS and sends it over the local network.
        :param image_data: base64 string, bytes, or PIL Image.
        :return: (success: bool, message: str)
        """
        self.ensure_one()
        try:
            escpos_bytes = image_to_escpos_raster(
                image_data,
                paper_width=self.paper_width,
                cut=cut,
                drawer=drawer,
            )
            return send_raw_to_printer(
                self.ip_address, self.port, escpos_bytes, timeout=self.connection_timeout
            )
        except Exception as err:
            err_msg = _("Raster conversion or socket error: %s") % str(err)
            _logger.error(f"[PosNetworkPrinter] {err_msg}")
            return False, err_msg
