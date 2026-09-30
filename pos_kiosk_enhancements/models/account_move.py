# -*- coding: utf-8 -*-
import base64
from odoo import api, fields, models
from werkzeug.urls import url_encode


class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_es_edi_verifactu_qr_image = fields.Binary(
        string="Veri*Factu QR Image",
        compute="_compute_l10n_es_edi_verifactu_qr_image",
    )

    @api.depends('state')
    def _compute_l10n_es_edi_verifactu_qr_image(self):
        for move in self:
            last_submission = (
                'l10n_es_edi_verifactu_document_ids' in move._fields
                and getattr(move, 'l10n_es_edi_verifactu_document_ids', False)
                and move.l10n_es_edi_verifactu_document_ids._get_last('submission')
            )
            if last_submission and last_submission.document_type == 'submission':
                record_identifier = last_submission._get_record_identifier()
                if record_identifier:
                    try:
                        endpoint_url = move.company_id._l10n_es_edi_verifactu_get_endpoints()['QR']
                        url_params = url_encode({
                            'nif': record_identifier['IDEmisorFactura'],
                            'numserie': record_identifier['NumSerieFactura'],
                            'fecha': record_identifier['FechaExpedicionFactura'],
                            'importe': record_identifier['ImporteTotal'],
                        })
                        full_url = f"{endpoint_url}?{url_params}"
                        qr_bytes = self.env['ir.actions.report'].barcode('QR', full_url, width=150, height=150, barLevel='M')
                        move.l10n_es_edi_verifactu_qr_image = base64.b64encode(qr_bytes).decode('utf-8')
                        continue
                    except Exception:
                        pass
            move.l10n_es_edi_verifactu_qr_image = False

    def _compute_l10n_es_edi_verifactu_qr_code(self):
        if hasattr(super(), '_compute_l10n_es_edi_verifactu_qr_code'):
            super()._compute_l10n_es_edi_verifactu_qr_code()
        for move in self:
            if 'l10n_es_edi_verifactu_qr_code' in move._fields:
                move.l10n_es_edi_verifactu_qr_code = False
