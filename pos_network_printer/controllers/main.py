# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request
import logging

_logger = logging.getLogger(__name__)


class PosNetworkPrinterController(http.Controller):

    @http.route('/pos/network_print', type='json', auth='user')
    def network_print(self, order_id, image_base64, printer_id=None):
        """
        JSON route for POS frontend to dispatch a print job to a network thermal printer.
        """
        res = request.env['pos.order'].print_network_receipt_from_ui(
            order_id=order_id,
            image_base64=image_base64,
            printer_id=printer_id,
        )
        return res

    @http.route('/pos/kiosk-print-receipt', type='json', auth='public', website=True)
    def kiosk_print_receipt(self, order_id=None, access_token=None, image_base64=None, config_id=None, printer_id=None):
        """
        Public JSON route for Kiosk / Self-Order to dispatch a print job to the network printer.
        """
        order = None
        if order_id:
            order = request.env['pos.order'].sudo().browse(order_id)
        if (not order or not order.exists()) and access_token:
            order = request.env['pos.order'].sudo().search([('access_token', '=', access_token)], limit=1)

        if not order or not order.exists():
            _logger.warning("[Kiosk Print] Order not found (order_id=%s, access_token=%s)", order_id, access_token)
            return {'success': False, 'message': 'Order not found'}

        # Ensure network printing is enabled
        config = order.config_id or (config_id and request.env['pos.config'].sudo().browse(config_id))
        if config and not config.enable_network_printing:
            return {'success': False, 'message': 'Network printing is disabled for this POS'}

        target_printer_id = printer_id or (config and config.network_printer_id.id)
        res = request.env['pos.order'].sudo().print_network_receipt_from_ui(
            order_id=order.id,
            image_base64=image_base64,
            printer_id=target_printer_id,
        )
        return res

    @http.route('/pos/network_printer/test', type='json', auth='user')
    def test_printer(self, printer_id):
        """
        JSON route to ping and test printer status from UI.
        """
        printer = request.env['pos.network.printer'].browse(printer_id)
        if not printer.exists():
            return {'success': False, 'message': 'Printer not found'}
        reachable, message = printer.action_test_connection()
        return {'success': reachable, 'message': message}
