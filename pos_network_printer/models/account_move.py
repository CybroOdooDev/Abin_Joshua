# -*- coding: utf-8 -*-
from odoo import models, fields, api, _

class AccountMove(models.Model):
    _inherit = 'account.move'

    def action_print_invoice_ticket_80mm(self):
        """Action called from the Invoices panel to print/download the 80mm ticket format."""
        self.ensure_one()
        return self.env.ref('pos_network_printer.report_invoice_ticket_80mm').report_action(self)
