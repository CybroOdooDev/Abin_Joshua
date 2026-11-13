# -- coding: utf-8 --
#############################################################################
#
#    Cybrosys Technologies Pvt. Ltd.
#
#    Copyright (C) 2026-TODAY Cybrosys Technologies(<https://www.cybrosys.com>)
#    Author: Cybrosys Techno Solutions(<https://www.cybrosys.com>)
#
#    You can modify it under the terms of the GNU LESSER
#    GENERAL PUBLIC LICENSE (LGPL v3), Version 3.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU LESSER GENERAL PUBLIC LICENSE (LGPL v3) for more details.
#
#    You should have received a copy of the GNU LESSER GENERAL PUBLIC LICENSE
#    (LGPL v3) along with this program.
#    If not, see <http://www.gnu.org/licenses/>.
#
#############################################################################
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
        compute='_compute_session_id',
        store=True,
        readonly=False,
        index=True,
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
            ('closing', 'Cash Closing (Z-Report)'),
        ],
        string='Print Purpose',
        default='first_print',
        required=True,
    )

    @api.depends('order_id', 'order_id.session_id')
    def _compute_session_id(self):
        for record in self:
            if record.order_id and record.order_id.session_id:
                record.session_id = record.order_id.session_id
            elif not record.session_id:
                record.session_id = False
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

    def action_print_closing_pdf(self):
        """Downloads the A4 PDF closing report for this ticket's session."""
        self.ensure_one()
        if not self.session_id:
            raise UserError(_("No session is associated with this closing report."))
        return self.env.ref('pos_network_printer.action_report_pos_cash_closing').report_action(self.session_id)
