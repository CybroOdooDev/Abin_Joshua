from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class AccountJournal(models.Model):
    """Add configurable starting sequence number for customer invoices."""

    _inherit = 'account.journal'

    invoice_starting_number = fields.Integer(
        string='Invoice Starting Number',
        default=1000,
        help="First sequence number used for customer invoices when starting a new period.",
    )

    @api.constrains('invoice_starting_number')
    def _check_invoice_starting_number(self):
        for journal in self:
            if journal.invoice_starting_number < 1:
                raise ValidationError(_("Invoice Starting Number must be at least 1."))
