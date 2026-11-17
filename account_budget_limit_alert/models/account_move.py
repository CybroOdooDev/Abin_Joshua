# -*- coding: utf-8 -*-
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
from odoo import api, fields, models
from odoo.exceptions import ValidationError


class AccountMove(models.Model):
    """Inherited to add extra fields and functions"""
    _inherit = "account.move"

    budget_warning = fields.Text(string='Warning',
                                 help='The warning message to be displayed'
                                      ' on the screen.',
                                 compute="_compute_budget_warning")
    budget_alert = fields.Boolean(string="Alert",
                                  help="True if need to raise budget alert",
                                  compute="_compute_budget_warning")
    alert_message = fields.Text(string='Alert Warning',
                                help='The alert message to be displayed on'
                                     ' the popup.',
                                compute="_compute_budget_warning")

    @api.depends('line_ids.price_total', 'line_ids.analytic_distribution')
    def _compute_budget_warning(self):
        """Function for computing values of budget_warning, budget_alert and
         alert_message"""
        for rec in self:
            rec.budget_warning = ""
            rec.budget_alert = False
            rec.alert_message = ""
            currency_symbol = rec.currency_id.symbol or rec.company_id.currency_id.symbol or ''
            for line in rec.line_ids:
                if line.analytic_distribution:
                    account_ids = [int(account_id) for key in
                                   line.analytic_distribution.keys() for
                                   account_id in key.split(',')
                                   if account_id.strip().isdigit()]
                    for acc in account_ids:
                        alert_line = self.env['budget.lines'].search(
                            [('analytic_account_id', '=', acc),
                             ('planned_amount', '<', line.price_total),
                             ('alert_type', '=', 'stop')],
                            order='planned_amount', limit=1)
                        if alert_line:
                            rec.budget_alert = True
                            excess = round(line.price_total - alert_line.planned_amount, 2)
                            partner_name = alert_line.analytic_account_id.partner_id.name
                            partner_str = f" - {partner_name}" if partner_name else ""
                            msg = f"Account {alert_line.analytic_account_id.name}{partner_str} Exceeds {currency_symbol}{excess:.2f}\n"
                            rec.alert_message += msg
                            rec.budget_warning += msg
                        else:
                            warning_line = self.env['budget.lines'].search(
                                [('analytic_account_id', '=', acc),
                                 ('planned_amount', '<', line.price_total),
                                 ('alert_type', '=', 'warning')],
                                order='planned_amount', limit=1)
                            if warning_line:
                                excess = round(line.price_total - warning_line.planned_amount, 2)
                                partner_name = warning_line.analytic_account_id.partner_id.name
                                partner_str = f" - {partner_name}" if partner_name else ""
                                rec.budget_warning += f"Account {warning_line.analytic_account_id.name}{partner_str} Exceeds {currency_symbol}{excess:.2f}\n"

    def action_post(self):
        """Override to check the budget limit"""
        for move in self:
            if move.budget_alert:
                raise ValidationError(move.alert_message)

        # Call the original action_post method
        return super().action_post()
