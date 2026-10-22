# -*- coding: utf-8 -*-
from odoo import models


class ResCompany(models.Model):
    _inherit = 'res.company'

    def write(self, vals):
        res = super().write(vals)
        if 'l10n_es_edi_verifactu_required' in vals:
            configs = self.env['pos.config'].search([('company_id', 'in', self.ids)])
            if configs:
                configs.write({'show_verifactu_qr': bool(vals['l10n_es_edi_verifactu_required'])})
        return res
