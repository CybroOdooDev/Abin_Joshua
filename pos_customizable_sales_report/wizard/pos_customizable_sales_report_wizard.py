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
import base64
import io
from datetime import datetime, time, timedelta
import pytz
import xlsxwriter

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class PosCustomizableSalesReportWizard(models.TransientModel):
    _name = 'pos.customizable.sales.report.wizard'
    _description = 'Customizable POS Sales Report Wizard'

    def _default_start_date(self):
        user_tz = pytz.timezone(self.env.context.get('tz') or self.env.user.tz or 'UTC')
        today = fields.Date.context_today(self)
        first_day_of_month = today.replace(day=1)
        start_dt = user_tz.localize(datetime.combine(first_day_of_month, time.min))
        return start_dt.astimezone(pytz.timezone('UTC')).replace(tzinfo=None)

    def _default_end_date(self):
        return fields.Datetime.now()

    start_date = fields.Datetime(
        string='Start Date',
        required=True,
        default=_default_start_date
    )
    end_date = fields.Datetime(
        string='End Date',
        required=True,
        default=_default_end_date
    )
    config_ids = fields.Many2many(
        'pos.config',
        string='Point of Sale Terminals',
        help='Leave empty to include all Point of Sale terminals'
    )
    session_ids = fields.Many2many(
        'pos.session',
        string='POS Sessions',
        help='Leave empty to include all sessions within the selected date range'
    )
    pos_category_ids = fields.Many2many(
        'pos.category',
        string='POS Categories',
        help='Filter by Point of Sale categories (includes combo sub-products belonging to these categories)'
    )
    product_category_ids = fields.Many2many(
        'product.category',
        string='Product Categories',
        help='Filter by internal product categories'
    )
    product_ids = fields.Many2many(
        'product.product',
        string='Specific Products',
        help='Filter to specific products only'
    )
    price_min = fields.Float(
        string='Min Price',
        help='Minimum unit price filter'
    )
    price_max = fields.Float(
        string='Max Price',
        help='Maximum unit price filter (0 for no upper limit)'
    )
    discount_filter = fields.Selection([
        ('all', 'All Lines'),
        ('discounted', 'Discounted Lines Only (> 0%)'),
        ('no_discount', 'Non-Discounted Lines Only (0%)'),
        ('custom_range', 'Specific Discount Range (%)')
    ], string='Discount Filter', default='all', required=True)

    discount_min = fields.Float(string='Min Discount (%)', default=0.0)
    discount_max = fields.Float(string='Max Discount (%)', default=100.0)

    revenue_attribution = fields.Selection([
        ('menu_level', 'Menu-Level Revenue (Quantity Tracking for Components)'),
        ('pro_rata', 'Prorated Revenue (Distribute Menu Price to Components)')
    ], string='Revenue Attribution', default='menu_level', required=True,
       help='- Menu-Level: The combo menu retains the full price; sub-products show quantity consumed.\n'
            '- Prorated: The combo price is distributed financially to sub-products based on their regular list price.')

    company_id = fields.Many2one(
        'res.company',
        string='Company',
        default=lambda self: self.env.company,
        required=True
    )

    excel_file = fields.Binary(string='Excel File', readonly=True)
    excel_filename = fields.Char(string='Excel Filename')

    @api.onchange('start_date')
    def _onchange_start_date(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            self.end_date = self.start_date + timedelta(days=1, seconds=-1)

    @api.onchange('end_date')
    def _onchange_end_date(self):
        if self.end_date and self.start_date and self.end_date < self.start_date:
            self.start_date = self.end_date - timedelta(days=1, seconds=-1)

    def _prepare_report_data(self):
        self.ensure_one()
        return {
            'start_date': fields.Datetime.to_string(self.start_date),
            'end_date': fields.Datetime.to_string(self.end_date),
            'config_ids': self.config_ids.ids,
            'session_ids': self.session_ids.ids,
            'pos_category_ids': self.pos_category_ids.ids,
            'product_category_ids': self.product_category_ids.ids,
            'product_ids': self.product_ids.ids,
            'price_min': self.price_min if self.price_min > 0 else None,
            'price_max': self.price_max if self.price_max > 0 else None,
            'discount_filter': self.discount_filter,
            'discount_min': self.discount_min,
            'discount_max': self.discount_max,
            'revenue_attribution': self.revenue_attribution,
            'company_id': self.company_id.id,
        }

    def action_print_pdf(self):
        """Generates the QWeb PDF report."""
        self.ensure_one()
        user_lang = self.env.user.lang or self.env.context.get('lang') or 'en_US'
        data = {'form': self._prepare_report_data()}
        return self.env.ref('pos_customizable_sales_report.action_report_customizable_sales').with_context(lang=user_lang).report_action(self, data=data)

    def action_export_xlsx(self):
        """Generates an Excel (XLSX) workbook with Option A hierarchical breakdown."""
        self.ensure_one()
        user_lang = self.env.user.lang or self.env.context.get('lang') or 'en_US'
        self = self.with_context(lang=user_lang)
        form_data = self._prepare_report_data()
        report_model = self.env['report.pos_customizable_sales_report.report_sales_template'].with_context(lang=user_lang)
        report_data = report_model.get_report_data(form_data)

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})

        # Formats
        title_fmt = workbook.add_format({'bold': True, 'font_size': 14, 'color': '#0f172a'})
        subtitle_fmt = workbook.add_format({'font_size': 10, 'color': '#64748b'})
        kpi_label_fmt = workbook.add_format({'font_size': 9, 'color': '#475569', 'bg_color': '#f8fafc', 'bold': True})
        kpi_val_fmt = workbook.add_format({'font_size': 12, 'bold': True, 'color': '#0f172a', 'bg_color': '#f8fafc', 'num_format': '#,##0.00'})
        header_fmt = workbook.add_format({'bold': True, 'bg_color': '#0f172a', 'color': '#ffffff', 'font_size': 10, 'border': 1})
        cat_header_fmt = workbook.add_format({'bold': True, 'bg_color': '#e2e8f0', 'color': '#1e293b', 'font_size': 11, 'border': 1})
        parent_combo_fmt = workbook.add_format({'bold': True, 'bg_color': '#f1f5f9', 'font_size': 10, 'border': 1})
        parent_combo_num_fmt = workbook.add_format({'bold': True, 'bg_color': '#f1f5f9', 'font_size': 10, 'num_format': '#,##0.00', 'border': 1})
        child_fmt = workbook.add_format({'font_size': 9, 'color': '#334155', 'indent': 1})
        child_num_fmt = workbook.add_format({'font_size': 9, 'color': '#334155', 'num_format': '#,##0.00'})
        regular_fmt = workbook.add_format({'font_size': 10})
        regular_num_fmt = workbook.add_format({'font_size': 10, 'num_format': '#,##0.00'})
        total_fmt = workbook.add_format({'bold': True, 'bg_color': '#cbd5e1', 'font_size': 10, 'border': 1})
        total_num_fmt = workbook.add_format({'bold': True, 'bg_color': '#cbd5e1', 'font_size': 10, 'num_format': '#,##0.00', 'border': 1})

        # =====================================================================
        # SHEET 1: Categorized Sales & Hierarchical Combos
        # =====================================================================
        sheet1 = workbook.add_worksheet(_('Sales & Combos Breakdown'))
        sheet1.set_column('A:A', 35)
        sheet1.set_column('B:B', 15)
        sheet1.set_column('C:C', 12)
        sheet1.set_column('D:D', 15)
        sheet1.set_column('E:E', 15)
        sheet1.set_column('F:F', 15)
        sheet1.set_column('G:G', 15)

        # Company & Report Header
        comp = report_data['company']
        meta = report_data['metadata']
        kpi = report_data['kpis']

        sheet1.write(0, 0, comp['name'].upper(), title_fmt)
        sheet1.write(1, 0, _("POS CUSTOMIZABLE SALES REPORT"), title_fmt)
        sheet1.write(2, 0, f"{_('Period')}: {meta['date_from_str']} - {meta['date_to_str']}", subtitle_fmt)
        sheet1.write(3, 0, f"{_('Attribution Mode')}: {meta['attribution_label']}", subtitle_fmt)
        sheet1.write(4, 0, f"{_('Terminals')}: {meta['configs']} | {meta.get('sessions_label', _('Sessions'))}: {meta['sessions']}", subtitle_fmt)

        # KPI Block
        row = 6
        sheet1.write(row, 0, _("TOTAL SALES (EXCL. VAT)"), kpi_label_fmt)
        sheet1.write(row, 1, _("TOTAL VAT AMOUNT"), kpi_label_fmt)
        sheet1.write(row, 2, _("TOTAL SALES (INCL. VAT)"), kpi_label_fmt)
        sheet1.write(row, 3, _("TOTAL ORDERS"), kpi_label_fmt)

        row += 1
        sheet1.write(row, 0, kpi['total_sales_excl_vat'], kpi_val_fmt)
        sheet1.write(row, 1, kpi['total_vat_amount'], kpi_val_fmt)
        sheet1.write(row, 2, kpi['total_sales_incl_vat'], kpi_val_fmt)
        sheet1.write(row, 3, kpi['total_orders'], kpi_val_fmt)

        # Sales Table
        row += 3
        headers = [_('Product / Component'), _('Reference'), _('Quantity'), _('Unit Price'), _('Net (Excl. VAT)'), _('VAT Amount'), _('Gross (Incl. VAT)')]
        for col, h in enumerate(headers):
            sheet1.write(row, col, h, header_fmt)

        for cat in report_data['categories']:
            row += 1
            # Category Header Row
            sheet1.merge_range(row, 0, row, 1, cat['name'].upper(), cat_header_fmt)
            sheet1.write(row, 2, cat['qty'], cat_header_fmt)
            sheet1.write(row, 3, '', cat_header_fmt)
            sheet1.write(row, 4, cat['subtotal'], cat_header_fmt)
            sheet1.write(row, 5, cat['tax'], cat_header_fmt)
            sheet1.write(row, 6, cat['gross'], cat_header_fmt)

            # 1. Combos in this category
            for combo in cat['combos']:
                row += 1
                sheet1.write(row, 0, f"[COMBO] {combo['product_name']}", parent_combo_fmt)
                sheet1.write(row, 1, combo['code'], parent_combo_fmt)
                sheet1.write(row, 2, combo['qty'], parent_combo_num_fmt)
                sheet1.write(row, 3, combo['price_unit'], parent_combo_num_fmt)
                sheet1.write(row, 4, combo['subtotal'], parent_combo_num_fmt)
                sheet1.write(row, 5, combo['tax'], parent_combo_num_fmt)
                sheet1.write(row, 6, combo['gross'], parent_combo_num_fmt)

                # Indented Components
                for comp in combo['components']:
                    row += 1
                    sheet1.write(row, 0, f"    ↳ {comp['product_name']}", child_fmt)
                    sheet1.write(row, 1, comp['code'], child_fmt)
                    sheet1.write(row, 2, comp['qty'], child_num_fmt)
                    sheet1.write(row, 3, comp['extra_price'] if comp['extra_price'] > 0 else 0.0, child_num_fmt)
                    sheet1.write(row, 4, comp['subtotal'], child_num_fmt)
                    sheet1.write(row, 5, comp['tax'], child_num_fmt)
                    sheet1.write(row, 6, comp['gross'], child_num_fmt)

            # 2. Standalone products in this category
            for prod in cat['standalone']:
                row += 1
                name_display = prod['product_name']
                if prod['in_combo_qty'] > 0:
                    name_display += f" (+{prod['in_combo_qty']} {_('in combos')})"
                sheet1.write(row, 0, name_display, regular_fmt)
                sheet1.write(row, 1, prod['code'], regular_fmt)
                sheet1.write(row, 2, prod['qty'], regular_num_fmt)
                sheet1.write(row, 3, prod['price_unit'], regular_num_fmt)
                sheet1.write(row, 4, prod['subtotal'], regular_num_fmt)
                sheet1.write(row, 5, prod['tax'], regular_num_fmt)
                sheet1.write(row, 6, prod['gross'], regular_num_fmt)

        # Final Totals Row
        row += 1
        sheet1.merge_range(row, 0, row, 1, _('TOTAL'), total_fmt)
        sheet1.write(row, 2, sum(c['qty'] for c in report_data['categories']), total_num_fmt)
        sheet1.write(row, 3, '', total_fmt)
        sheet1.write(row, 4, kpi['total_sales_excl_vat'], total_num_fmt)
        sheet1.write(row, 5, kpi['total_vat_amount'], total_num_fmt)
        sheet1.write(row, 6, kpi['total_sales_incl_vat'], total_num_fmt)

        # =====================================================================
        # SHEET 2: Multi-Rate VAT Breakdown
        # =====================================================================
        sheet2 = workbook.add_worksheet(_('VAT Breakdown'))
        sheet2.set_column('A:A', 30)
        sheet2.set_column('B:B', 15)
        sheet2.set_column('C:C', 20)
        sheet2.set_column('D:D', 20)
        sheet2.set_column('E:E', 20)

        sheet2.write(0, 0, _("TAX / VAT BREAKDOWN"), title_fmt)
        sheet2.write(1, 0, f"{_('Period')}: {meta['date_from_str']} - {meta['date_to_str']}", subtitle_fmt)

        row = 3
        v_headers = [_('Tax Name / Rule'), _('Tax Rate (%)'), _('Base Amount (Excl. VAT)'), _('Tax Amount'), _('Total (Incl. VAT)')]
        for col, h in enumerate(v_headers):
            sheet2.write(row, col, h, header_fmt)

        for tax in report_data['taxes']:
            row += 1
            sheet2.write(row, 0, tax['name'], regular_fmt)
            sheet2.write(row, 1, f"{tax['rate']}%", regular_fmt)
            sheet2.write(row, 2, tax['base'], regular_num_fmt)
            sheet2.write(row, 3, tax['tax'], regular_num_fmt)
            sheet2.write(row, 4, tax['gross'], regular_num_fmt)

        row += 1
        sheet2.write(row, 0, _('TOTAL'), total_fmt)
        sheet2.write(row, 1, '', total_fmt)
        sheet2.write(row, 2, kpi['total_sales_excl_vat'], total_num_fmt)
        sheet2.write(row, 3, kpi['total_vat_amount'], total_num_fmt)
        sheet2.write(row, 4, kpi['total_sales_incl_vat'], total_num_fmt)

        # =====================================================================
        # SHEET 3: Consolidated Product Consumption Matrix
        # =====================================================================
        sheet3 = workbook.add_worksheet(_('Consolidated Product Matrix'))
        sheet3.set_column('A:A', 35)
        sheet3.set_column('B:B', 15)
        sheet3.set_column('C:C', 25)
        sheet3.set_column('D:D', 15)
        sheet3.set_column('E:E', 15)
        sheet3.set_column('F:F', 15)
        sheet3.set_column('G:G', 15)
        sheet3.set_column('H:H', 15)

        sheet3.write(0, 0, _("CONSOLIDATED PRODUCT CONSUMPTION MATRIX"), title_fmt)
        sheet3.write(1, 0, _("Shows total units sold combining standalone sales and in-combo inclusions"), subtitle_fmt)

        row = 3
        c_headers = [_('Product'), _('Reference'), _('Category'), _('Standalone Qty'), _('In-Combo Qty'), _('Total Qty Sold'), _('Net Amount'), _('Gross Amount')]
        for col, h in enumerate(c_headers):
            sheet3.write(row, col, h, header_fmt)

        for item in report_data['consumption']:
            row += 1
            sheet3.write(row, 0, item['product_name'], regular_fmt)
            sheet3.write(row, 1, item['code'], regular_fmt)
            sheet3.write(row, 2, item['category_name'], regular_fmt)
            sheet3.write(row, 3, item['standalone_qty'], regular_num_fmt)
            sheet3.write(row, 4, item['combo_qty'], regular_num_fmt)
            sheet3.write(row, 5, item['total_qty'], regular_num_fmt)
            sheet3.write(row, 6, item['subtotal'], regular_num_fmt)
            sheet3.write(row, 7, item['gross'], regular_num_fmt)

        workbook.close()
        output.seek(0)
        file_data = output.read()
        output.close()

        filename = f"Sales_Report_{fields.Date.today().strftime('%Y%m%d')}.xlsx"
        self.write({
            'excel_file': base64.b64encode(file_data),
            'excel_filename': filename,
        })

        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/?model={self._name}&id={self.id}&field=excel_file&filename={self.excel_filename}&download=true',
            'target': 'self',
        }

