# -*- coding: utf-8 -*-
import urllib.parse
import base64
from odoo import models, fields, api, _

class AccountMove(models.Model):
    _inherit = 'account.move'

    def action_print_invoice_ticket_80mm(self):
        """Action called from the Invoices panel to print/download the 80mm ticket format."""
        self.ensure_one()
        return self.env.ref('pos_network_printer.report_invoice_ticket_80mm').report_action(self)

    def _get_ticket_lines(self):
        """Return list of line dicts formatted for the 80mm thermal receipt,
        preserving combo parent/child hierarchy from the originating POS order."""
        self.ensure_one()
        if self.pos_order_ids and self.pos_order_ids[0].lines:
            pos_lines = self.pos_order_ids[0].lines
            result = []
            for ol in pos_lines:
                is_child = bool(ol.combo_parent_id)
                qty_str = ('%.0f' % ol.qty) if (ol.qty % 1 == 0 and is_child) else ('%.2f' % ol.qty)
                uom_name = ol.product_uom_id.name or (ol.product_id.uom_id.name if ol.product_id else 'Units')
                result.append({
                    'name': ol.product_id.name or ol.full_product_name or '',
                    'qty': ol.qty,
                    'qty_str': qty_str,
                    'unit_name': uom_name,
                    'price_unit': ol.price_unit,
                    'price_total': ol.price_subtotal_incl,
                    'discount': ol.discount,
                    'is_combo_child': is_child,
                })
            return result

        # Fallback for invoices not created from a POS order
        result = []
        for line in self.invoice_line_ids.filtered(lambda l: l.display_type in ('product', False)):
            qty_str = ('%.2f' % line.quantity)
            uom_name = line.product_uom_id.name or 'Units'
            result.append({
                'name': line.product_id.name if line.product_id else (line.name or ''),
                'qty': line.quantity,
                'qty_str': qty_str,
                'unit_name': uom_name,
                'price_unit': line.price_unit,
                'price_total': line.price_total,
                'discount': line.discount,
                'is_combo_child': False,
            })
        return result

    def _get_verifactu_qr_data_uri(self):
        """Return base64 data URI of the Veri*Factu QR code image."""
        self.ensure_one()
        qr_code = getattr(self, 'l10n_es_edi_verifactu_qr_code', False)
        if not qr_code and self.pos_order_ids:
            qr_code = getattr(self.pos_order_ids[0], 'l10n_es_edi_verifactu_qr_code', False)
        if not qr_code:
            return False

        parsed = urllib.parse.urlparse(qr_code)
        params = urllib.parse.parse_qs(parsed.query)
        value = params.get('value', [None])[0] or qr_code
        try:
            barcode_png = self.env['ir.actions.report'].barcode('QR', value, width=180, height=180)
            return f"data:image/png;base64,{base64.b64encode(barcode_png).decode()}"
        except Exception:
            return qr_code
