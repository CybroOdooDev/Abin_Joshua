from odoo import models


class AccountMove(models.Model):
    """Apply journal's starting number to customer invoice sequences."""

    _inherit = 'account.move'

    def _get_next_sequence_format(self):
        """Start customer invoice sequences at the journal's starting number."""
        format_string, format_values = super()._get_next_sequence_format()
        is_customer_invoice = (
            self.journal_id.type == 'sale' and self.move_type == 'out_invoice'
        )
        start_from = self.journal_id.invoice_starting_number
        if not is_customer_invoice or start_from <= 1:
            return format_string, format_values

        target_prev_seq = start_from - 1
        if format_values.get('seq', 0) < target_prev_seq:
            format_values['seq'] = target_prev_seq
            format_values['seq_length'] = max(
                format_values.get('seq_length', 0),
                len(str(start_from)),
            )

        return format_string, format_values
