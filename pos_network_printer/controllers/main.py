# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request


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
