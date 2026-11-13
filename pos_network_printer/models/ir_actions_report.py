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
import logging
from odoo import models, api

_logger = logging.getLogger(__name__)


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    def _render_qweb_pdf(self, report_ref, res_ids=None, data=None):
        """
        Dynamically calculates the exact ticket height needed for 80mm thermal receipts/invoices
        based on the number of orderlines. Guarantees that the entire document renders on
        a single continuous sheet without page breaks or split cuts.
        """
        report_sudo = self._get_report(report_ref)
        if report_sudo.report_name == 'pos_network_printer.report_invoice_ticket' and res_ids:
            try:
                moves = self.env['account.move'].browse(res_ids)
                max_lines = 0
                for m in moves:
                    if hasattr(m, '_get_ticket_lines'):
                        lines_count = len(m._get_ticket_lines())
                    else:
                        lines_count = len(m.invoice_line_ids)
                    if lines_count > max_lines:
                        max_lines = lines_count

                # Base ticket overhead: Header (50mm) + Company info & address (50mm) + Total (20mm) +
                # Taxes (30mm) + Veri*Factu QR (45mm) + Footer (25mm) = ~220mm.
                # Each product line with unit calculation (allowing wrapping) = ~11mm.
                # Generous safety padding = 35mm.
                # Resulting height is calculated to fit on 1 single continuous sheet.
                dyn_height = max(240, 220 + (max_lines * 11) + 35)
                self = self.with_context(ticket_dynamic_page_height=dyn_height)
                _logger.info("Computed dynamic single-sheet page height for %s: %dmm (%d lines)",
                             report_sudo.report_name, dyn_height, max_lines)
            except Exception as e:
                _logger.warning("Could not compute dynamic ticket height: %s", e)

        return super()._render_qweb_pdf(report_ref, res_ids=res_ids, data=data)

    def _build_wkhtmltopdf_args(self, paperformat_id, landscape=False, specific_paperformat_args=None, set_viewport_size=False):
        command_args = super()._build_wkhtmltopdf_args(
            paperformat_id, landscape=landscape,
            specific_paperformat_args=specific_paperformat_args,
            set_viewport_size=set_viewport_size
        )

        dyn_height = self._context.get('ticket_dynamic_page_height')
        is_ticket_report = (
            self.report_name == 'pos_network_printer.report_invoice_ticket' or
            (paperformat_id and paperformat_id == self.env.ref('pos_network_printer.paperformat_invoice_ticket_80mm', raise_if_not_found=False))
        )

        if is_ticket_report:
            # If dynamic height was computed from records, apply it directly; otherwise use generous single-sheet default
            target_height = dyn_height or 380
            if '--page-height' in command_args:
                idx = command_args.index('--page-height')
                command_args[idx + 1] = f'{target_height}mm'
            else:
                command_args.extend(['--page-height', f'{target_height}mm'])

            # Enable smart shrinking: ensures WebKit shrinks content to fit on a single page
            # rather than overflowing to a second page
            if '--disable-smart-shrinking' in command_args:
                command_args.remove('--disable-smart-shrinking')

        return command_args

