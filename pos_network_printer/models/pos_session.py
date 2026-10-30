# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class PosSession(models.Model):
    _inherit = 'pos.session'

    def get_cash_closing_report_data(self):
        """
        Calculates and returns complete summary data for the Cash Closing Report.
        Compatible with CashSecurity module which automatically populates
        cash_register_balance_start and cash_register_balance_end_real.
        """
        self.ensure_one()

        orders = self.order_ids.filtered(lambda o: o.state in ['paid', 'done', 'invoiced'])
        currency = self.currency_id

        # 1. Dynamic Payment Methods (All configured in POS config)
        configured_payment_methods = self.config_id.payment_method_ids
        all_payments = orders.payment_ids

        payment_methods_summary = []
        for pm in configured_payment_methods:
            pm_payments = all_payments.filtered(lambda p: p.payment_method_id == pm)
            amount = sum(pm_payments.mapped('amount'))
            count = len(pm_payments)
            is_cash = bool(pm.type == 'cash' or pm.is_cash_count)
            payment_methods_summary.append({
                'id': pm.id,
                'name': pm.name,
                'type': pm.type,
                'is_cash': is_cash,
                'amount': amount,
                'count': count,
            })

        # 2. Total Sales and Tax Breakdown
        gross_sales = sum(orders.mapped('amount_total'))
        tax_total = sum(orders.mapped('amount_tax'))
        net_sales = gross_sales - tax_total

        # 3. Cash Drawer Balance & Cash Movements (CashSecurity Compatibility)
        opening_cash = self.cash_register_balance_start or 0.0

        cash_pm_ids = configured_payment_methods.filtered(lambda pm: pm.type == 'cash' or pm.is_cash_count).ids
        cash_payments = all_payments.filtered(lambda p: p.payment_method_id.id in cash_pm_ids)
        cash_sales = sum(cash_payments.mapped('amount'))

        # Cash In / Cash Out movements
        cash_in = 0.0
        cash_out = 0.0
        moves_list = []
        for move in self.sudo().statement_line_ids.sorted('create_date'):
            move_amount = move.amount
            if move_amount >= 0:
                cash_in += move_amount
            else:
                cash_out += abs(move_amount)

            moves_list.append({
                'name': move.payment_ref or ('Cash In' if move_amount >= 0 else 'Cash Out'),
                'amount': move_amount,
                'date': fields.Datetime.to_string(move.create_date) if move.create_date else False,
            })

        net_cash_moves = cash_in - cash_out
        expected_cash = opening_cash + cash_sales + net_cash_moves
        counted_cash = self.cash_register_balance_end_real or 0.0
        difference = counted_cash - expected_cash

        # Company details
        company = self.company_id
        company_address_parts = [p for p in [company.street, company.street2, company.city, company.zip] if p]

        return {
            'session': {
                'id': self.id,
                'name': self.name,
                'pos_name': self.config_id.name,
                'cashier': self.user_id.name,
                'start_at': fields.Datetime.to_string(self.start_at) if self.start_at else False,
                'stop_at': fields.Datetime.to_string(self.stop_at or fields.Datetime.now()),
                'state': self.state,
                'printer_type': self.config_id.cash_closing_printer_type,
            },
            'company': {
                'name': company.name,
                'vat': company.vat or '',
                'address': ', '.join(company_address_parts),
                'phone': company.phone or '',
                'email': company.email or '',
            },
            'currency': {
                'symbol': currency.symbol,
                'position': currency.position,
                'decimals': currency.decimal_places or 2,
            },
            'sales_summary': {
                'total_orders': len(orders),
                'net_sales': net_sales,
                'tax_total': tax_total,
                'gross_sales': gross_sales,
            },
            'payment_methods': payment_methods_summary,
            'cash_details': {
                'opening_cash': opening_cash,
                'cash_sales': cash_sales,
                'cash_in': cash_in,
                'cash_out': cash_out,
                'net_cash_moves': net_cash_moves,
                'expected_cash': expected_cash,
                'counted_cash': counted_cash,
                'difference': difference,
                'moves': moves_list,
            },
        }
