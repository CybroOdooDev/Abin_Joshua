# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)


class PosPrintedTicket(models.Model):
    _name = 'pos.printed.ticket'
    _description = 'POS Printed Ticket History'
    _order = 'print_date desc, id desc'

    name = fields.Char(
        string='Ticket Identifier',
        required=True,
        index=True,
        help='Order reference or tracking number',
    )
    order_id = fields.Many2one(
        'pos.order',
        string='POS Order',
        required=False,
        ondelete='cascade',
        index=True,
    )
    session_id = fields.Many2one(
        'pos.session',
        string='POS Session',
        related='order_id.session_id',
        store=True,
    )
    pos_reference = fields.Char(
        string='POS Receipt Ref',
        related='order_id.pos_reference',
        store=True,
    )
    printer_name = fields.Char(string='Printer Name', readonly=True)

    print_date = fields.Datetime(
        string='Print Date & Time',
        default=fields.Datetime.now,
        required=True,
        readonly=True,
    )
    user_id = fields.Many2one(
        'res.users',
        string='Cashier / User',
        default=lambda self: self.env.user,
        readonly=True,
    )
    print_type = fields.Selection(
        [
            ('first_print', 'Original Ticket'),
            ('reprint', 'Reprint Copy'),
            ('bill', 'Pre-Payment Bill'),
            ('invoice', 'Formal Legal Invoice'),
            ('kitchen', 'Kitchen Preparation'),
        ],
        string='Print Purpose',
        default='first_print',
        required=True,
    )
    receipt_snapshot = fields.Text(
        string='Ticket Snapshot (Base64)',
        help='High-resolution visual snapshot of the printed ticket preserving exact layout and Veri*Factu QR',
    )
    reprint_count = fields.Integer(string='Reprint Times', default=0)
    status = fields.Selection(
        [
            ('success', 'Printed Successfully'),
            ('failed', 'Print Failed'),
        ],
        string='Print Status',
        default='success',
        required=True,
    )
    error_message = fields.Text(string='Error Diagnostic')

    def action_reprint(self):
        """Notifies user that reprinting is executed via QZ Tray in POS."""
        self.ensure_one()
        if not self.receipt_snapshot:
            raise UserError(_("No visual snapshot is available for this ticket to reprint."))

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Reprint from POS'),
                'message': _('To reprint this ticket directly to your thermal printer via QZ Tray, open the POS screen and click "Reprint Receipt" on the order.'),
                'type': 'info',
                'sticky': True,
            },
        }
