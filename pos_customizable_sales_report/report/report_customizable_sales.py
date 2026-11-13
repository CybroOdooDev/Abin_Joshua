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
from datetime import datetime, time, timedelta
import pytz
from collections import defaultdict

from odoo import api, fields, models, _
from odoo.exceptions import UserError
from odoo.osv.expression import AND


class ReportCustomizableSales(models.AbstractModel):
    _name = 'report.pos_customizable_sales_report.report_sales_template'
    _description = 'Customizable Point of Sale Sales Report'

    @api.model
    def _get_report_values(self, docids, data=None):
        data = dict(data or {})
        user_lang = self.env.context.get('lang') or self.env.user.lang or 'en_US'
        self = self.with_context(lang=user_lang)
        wizard_data = data.get('form')
        if not wizard_data and docids:
            wizard = self.env['pos.customizable.sales.report.wizard'].browse(docids[0])
            if wizard.exists():
                wizard_data = wizard._prepare_report_data()
        if not wizard_data:
            wizard_data = {}

        report_data = self.get_report_data(wizard_data)
        return {
            'doc_ids': docids,
            'doc_model': 'pos.customizable.sales.report.wizard',
            'docs': self.env['pos.customizable.sales.report.wizard'].browse(docids) if docids else self.env['pos.customizable.sales.report.wizard'],
            'data': data,
            'report': report_data,
        }

    @api.model
    def get_report_data(self, wizard_data):
        """
        Main calculation engine that fetches and processes POS sales data.
        Returns aggregated structures with hierarchical combo breakdown,
        dual revenue attribution, and multi-rate VAT calculations.
        """
        company_id = wizard_data.get('company_id') or self.env.company.id
        company = self.env['res.company'].browse(company_id)
        user_tz = pytz.timezone(self.env.context.get('tz') or self.env.user.tz or 'UTC')

        # 1. Parse Dates in UTC
        date_from_str = wizard_data.get('start_date')
        date_to_str = wizard_data.get('end_date')

        if date_from_str:
            date_from = fields.Datetime.from_string(date_from_str)
        else:
            today_date = fields.Date.context_today(self)
            first_day = today_date.replace(day=1)
            start_dt = user_tz.localize(datetime.combine(first_day, time.min))
            date_from = start_dt.astimezone(pytz.timezone('UTC')).replace(tzinfo=None)

        if date_to_str:
            date_to = fields.Datetime.from_string(date_to_str)
        else:
            date_to = fields.Datetime.now()

        if date_to < date_from:
            date_to = date_from + timedelta(days=1, seconds=-1)

        config_ids = wizard_data.get('config_ids') or []
        session_ids = wizard_data.get('session_ids') or []
        pos_category_ids = set(wizard_data.get('pos_category_ids') or [])
        product_category_ids = set(wizard_data.get('product_category_ids') or [])
        product_ids = set(wizard_data.get('product_ids') or [])
        price_min = wizard_data.get('price_min')
        price_max = wizard_data.get('price_max')
        discount_filter = wizard_data.get('discount_filter') or 'all'
        discount_min = wizard_data.get('discount_min') or 0.0
        discount_max = wizard_data.get('discount_max') or 100.0
        revenue_attribution = wizard_data.get('revenue_attribution') or 'menu_level'

        # 2. Query Orders
        domain = [
            ('state', 'in', ['paid', 'invoiced', 'done']),
            ('date_order', '>=', fields.Datetime.to_string(date_from)),
            ('date_order', '<=', fields.Datetime.to_string(date_to)),
            ('company_id', '=', company.id),
        ]
        if config_ids:
            domain = AND([domain, [('config_id', 'in', config_ids)]])
        if session_ids:
            domain = AND([domain, [('session_id', 'in', session_ids)]])

        orders = self.env['pos.order'].search(domain, order='date_order asc')
        currency = company.currency_id

        # Determine configs and sessions display strings
        configs = self.env['pos.config'].browse(config_ids) if config_ids else orders.mapped('config_id')
        sessions = self.env['pos.session'].browse(session_ids) if session_ids else orders.mapped('session_id')

        configs_display = f"{len(configs)} {_('Terminals')}" if len(configs) > 3 else (", ".join(configs.mapped('name')) if configs else _('All Terminals'))

        if not sessions:
            sessions_display = _('All Sessions')
            sessions_label = _('Sessions')
        elif len(sessions) == 1:
            sessions_display = sessions[0].name
            sessions_label = _('Session')
        elif len(sessions) <= 3:
            sessions_display = ", ".join(sessions.mapped('name'))
            sessions_label = _('Sessions')
        else:
            sorted_sessions = sessions.sorted(key=lambda s: s.start_at or s.id)
            first_name = sorted_sessions[0].name
            last_name = sorted_sessions[-1].name
            sessions_display = f"{first_name} ... {last_name} ({len(sessions)} {_('Sessions')})"
            sessions_label = _('Sessions')

        # 3. Process Lines: Map Combos and Components
        # Structure per order:
        # parent lines have combo_line_ids or have child lines linked via combo_parent_id
        taxes_dict = defaultdict(lambda: {'name': '', 'rate': 0.0, 'base': 0.0, 'tax': 0.0})
        
        # Category containers
        # category_name -> {
        #    'category_id': id,
        #    'category_name': name,
        #    'combos': { combo_product_id: { 'product': product, 'lines': [...], 'components': { comp_product_id: {...} } } },
        #    'standalone': { product_id: { 'product': product, 'lines': [...] } }
        # }
        categories_map = defaultdict(lambda: {
            'name': '',
            'combos': defaultdict(lambda: {
                'product': None,
                'qty': 0.0,
                'price_unit': 0.0,
                'subtotal': 0.0,
                'tax': 0.0,
                'gross': 0.0,
                'components': defaultdict(lambda: {
                    'product': None,
                    'qty': 0.0,
                    'extra_price': 0.0,
                    'subtotal': 0.0,
                    'tax': 0.0,
                    'gross': 0.0,
                })
            }),
            'standalone': defaultdict(lambda: {
                'product': None,
                'qty': 0.0,
                'price_unit': 0.0,
                'discount': 0.0,
                'subtotal': 0.0,
                'tax': 0.0,
                'gross': 0.0,
                'in_combo_qty': 0.0,
            })
        })

        # Global product consumption matrix: product_id -> dict
        global_consumption = defaultdict(lambda: {
            'product': None,
            'category_name': '',
            'standalone_qty': 0.0,
            'combo_qty': 0.0,
            'total_qty': 0.0,
            'subtotal': 0.0,
            'tax': 0.0,
            'gross': 0.0,
        })

        total_orders_count = len(orders)
        total_sales_excl_vat = 0.0
        total_vat_amount = 0.0
        total_sales_incl_vat = 0.0

        for order in orders:
            order_lines = order.lines
            # Build parent-child map for this order
            # line_id -> list of child lines
            combo_parents = {}
            combo_children_ids = set()

            # Pass 1: Identify combo parents and children
            for line in order_lines:
                if line.combo_parent_id:
                    parent = line.combo_parent_id
                    combo_parents.setdefault(parent.id, []).append(line)
                    combo_children_ids.add(line.id)
                elif line.combo_line_ids:
                    combo_parents.setdefault(line.id, [])

            # Pass 2: Process Combos and Standalone items
            for line in order_lines:
                if line.id in combo_children_ids:
                    # Child lines are processed with their parent
                    continue

                is_combo = (line.id in combo_parents) or bool(line.combo_line_ids)

                if is_combo:
                    children = combo_parents.get(line.id, line.combo_line_ids)
                    self._process_combo_line(
                        line, children, revenue_attribution, currency,
                        pos_category_ids, product_category_ids, product_ids,
                        price_min, price_max, discount_filter, discount_min, discount_max,
                        categories_map, taxes_dict, global_consumption
                    )
                else:
                    self._process_standalone_line(
                        line, currency,
                        pos_category_ids, product_category_ids, product_ids,
                        price_min, price_max, discount_filter, discount_min, discount_max,
                        categories_map, taxes_dict, global_consumption
                    )

        # 4. Finalize Categories Structure & Totals
        categories_list = []
        for cat_name, cat_data in sorted(categories_map.items(), key=lambda x: x[0]):
            combos_list = []
            cat_subtotal = 0.0
            cat_tax = 0.0
            cat_gross = 0.0
            cat_qty = 0.0

            for combo_prod_id, c_data in cat_data['combos'].items():
                components_list = []
                comp_extra_subtotal = 0.0
                comp_extra_tax = 0.0
                comp_extra_gross = 0.0
                for comp_prod_id, comp_data in sorted(c_data['components'].items(), key=lambda x: x[1]['product'].name if x[1]['product'] else ''):
                    if comp_data['qty'] <= 0:
                        continue
                    components_list.append({
                        'product_id': comp_prod_id,
                        'product_name': comp_data['product'].name if comp_data['product'] else _('Unknown'),
                        'code': comp_data['product'].default_code or '',
                        'qty': comp_data['qty'],
                        'extra_price': comp_data['extra_price'],
                        'subtotal': comp_data['subtotal'],
                        'tax': comp_data['tax'],
                        'gross': comp_data['gross'],
                    })
                    comp_extra_subtotal += comp_data['subtotal']
                    comp_extra_tax += comp_data['tax']
                    comp_extra_gross += comp_data['gross']

                combos_list.append({
                    'product_id': combo_prod_id,
                    'product_name': c_data['product'].name if c_data['product'] else _('Combo Menu'),
                    'code': c_data['product'].default_code or '',
                    'qty': c_data['qty'],
                    'price_unit': c_data['price_unit'],
                    'subtotal': c_data['subtotal'],
                    'tax': c_data['tax'],
                    'gross': c_data['gross'],
                    'components': components_list,
                })
                cat_qty += c_data['qty']
                cat_subtotal += (c_data['subtotal'] + comp_extra_subtotal)
                cat_tax += (c_data['tax'] + comp_extra_tax)
                cat_gross += (c_data['gross'] + comp_extra_gross)

            standalone_list = []
            for prod_id, s_data in cat_data['standalone'].items():
                if s_data['qty'] <= 0 and s_data['subtotal'] == 0:
                    continue
                standalone_list.append({
                    'product_id': prod_id,
                    'product_name': s_data['product'].name if s_data['product'] else _('Unknown'),
                    'code': s_data['product'].default_code or '',
                    'qty': s_data['qty'],
                    'price_unit': s_data['price_unit'],
                    'discount': s_data['discount'],
                    'subtotal': s_data['subtotal'],
                    'tax': s_data['tax'],
                    'gross': s_data['gross'],
                    'in_combo_qty': s_data['in_combo_qty'],
                    'total_consumption_qty': s_data['qty'] + s_data['in_combo_qty'],
                })
                cat_qty += s_data['qty']
                cat_subtotal += s_data['subtotal']
                cat_tax += s_data['tax']
                cat_gross += s_data['gross']

            if combos_list or standalone_list:
                categories_list.append({
                    'name': cat_name,
                    'qty': cat_qty,
                    'subtotal': cat_subtotal,
                    'tax': cat_tax,
                    'gross': cat_gross,
                    'combos': combos_list,
                    'standalone': standalone_list,
                })

        # 5. Format Taxes Breakdown Table
        taxes_list = []
        for tax_id, tax_data in sorted(taxes_dict.items(), key=lambda x: x[1]['rate']):
            taxes_list.append({
                'name': tax_data['name'] or _('No Tax / Exempt'),
                'rate': tax_data['rate'],
                'base': tax_data['base'],
                'tax': tax_data['tax'],
                'gross': tax_data['base'] + tax_data['tax'],
            })
            total_sales_excl_vat += tax_data['base']
            total_vat_amount += tax_data['tax']
            total_sales_incl_vat += (tax_data['base'] + tax_data['tax'])

        # 6. Format Consolidated Consumption Matrix
        consumption_list = []
        for prod_id, cons_data in sorted(global_consumption.items(), key=lambda x: x[1]['product'].name if x[1]['product'] else ''):
            if cons_data['total_qty'] != 0 or cons_data['subtotal'] != 0:
                consumption_list.append({
                    'product_id': prod_id,
                    'product_name': cons_data['product'].name if cons_data['product'] else _('Unknown'),
                    'code': cons_data['product'].default_code or '',
                    'category_name': cons_data['category_name'],
                    'standalone_qty': cons_data['standalone_qty'],
                    'combo_qty': cons_data['combo_qty'],
                    'total_qty': cons_data['total_qty'],
                    'subtotal': cons_data['subtotal'],
                    'tax': cons_data['tax'],
                    'gross': cons_data['gross'],
                })

        # 7. Payment Methods Breakdown
        payment_ids = self.env["pos.payment"].search([('pos_order_id', 'in', orders.ids)]).ids
        payments = []
        if payment_ids:
            self.env.cr.execute("""
                SELECT method.id AS id,
                       COALESCE(method.name->>%s, method.name->>'en_US') AS name,
                       SUM(payment.amount) AS total
                FROM pos_payment AS payment
                JOIN pos_payment_method AS method ON payment.payment_method_id = method.id
                WHERE payment.id IN %s
                GROUP BY method.id, method.name
                ORDER BY method.id
            """, (self.env.lang or 'en_US', tuple(payment_ids),))
            payments = self.env.cr.dictfetchall()

        labels = {
            'pos_sales_report': _('POS SALES REPORT'),
            'customizable_combos_taxes': _('CUSTOMIZABLE COMBOS & TAXES'),
            'period': _('Period'),
            'terminals': _('Terminals'),
            'printed': _('Printed'),
            'nif_cif_vat': _('NIF/CIF/VAT'),
            'tel': _('Tel'),
            'net_sales': _('NET SALES (EXCL. VAT)'),
            'total_vat': _('TOTAL VAT AMOUNT'),
            'gross_sales': _('GROSS SALES (INCL. VAT)'),
            'total_orders': _('TOTAL ORDERS'),
            'vat_breakdown': _('VAT / Tax Breakdown'),
            'tax_rule': _('Tax Rule / Rate'),
            'tax_rate': _('Tax Rate'),
            'base_amount': _('Base Amount (Excl. VAT)'),
            'vat_amount': _('VAT Amount'),
            'total_amount': _('Total Amount (Incl. VAT)'),
            'total_taxes': _('Total Taxes'),
            'sales_category_breakdown': _('Sales by Category & Combo Breakdown'),
            'units': _('Units'),
            'product_component': _('Product / Component'),
            'ref': _('Ref'),
            'qty': _('Qty'),
            'unit_price': _('Unit Price'),
            'net_excl_vat': _('Net (Excl. VAT)'),
            'vat': _('VAT'),
            'gross_incl_vat': _('Gross (Incl. VAT)'),
            'combo': _('COMBO'),
            'in_combos': _('in combos'),
            'consumption_matrix': _('Consolidated Product Consumption Matrix'),
            'consumption_subtitle': _('Shows the exact count of physical units consumed across both standalone sales and combo inclusions.'),
            'product': _('Product'),
            'category': _('Category'),
            'standalone_qty': _('Standalone Qty'),
            'in_combo_qty': _('In-Combo Qty'),
            'total_units': _('Total Units'),
            'payment_methods': _('Payment Methods'),
            'method': _('Method'),
            'total_paid': _('Total Paid'),
        }

        return {
            'company': {
                'name': company.name,
                'vat': company.vat or '',
                'phone': company.phone or '',
                'email': company.email or '',
                'street': company.street or '',
                'city_zip': f"{company.zip or ''} {company.city or ''}".strip(),
            },
            'metadata': {
                'date_from': date_from,
                'date_to': date_to,
                'date_from_str': date_from.strftime('%d/%m/%Y %H:%M:%S'),
                'date_to_str': date_to.strftime('%d/%m/%Y %H:%M:%S'),
                'configs': configs_display,
                'sessions': sessions_display,
                'sessions_label': sessions_label,
                'revenue_attribution': revenue_attribution,
                'attribution_label': _('Menu-Level (Quantity Tracking)') if revenue_attribution == 'menu_level' else _('Prorated (Financial Distribution)'),
                'currency': currency,
            },
            'labels': labels,
            'kpis': {
                'total_orders': total_orders_count,
                'total_sales_excl_vat': total_sales_excl_vat,
                'total_vat_amount': total_vat_amount,
                'total_sales_incl_vat': total_sales_incl_vat,
            },
            'categories': categories_list,
            'taxes': taxes_list,
            'consumption': consumption_list,
            'payments': payments,
        }

    # -------------------------------------------------------------------------
    # Helper Processing Methods
    # -------------------------------------------------------------------------

    def _get_category_name(self, product):
        if product.pos_categ_ids:
            return product.pos_categ_ids[0].name
        if product.categ_id:
            return product.categ_id.name
        return _('Uncategorized')

    def _line_matches_filters(self, line, pos_cats, prod_cats, prods, p_min, p_max, d_filter, d_min, d_max):
        prod = line.product_id
        if prods and prod.id not in prods:
            return False
        if pos_cats and not any(c.id in pos_cats for c in prod.pos_categ_ids):
            return False
        if prod_cats and prod.categ_id.id not in prod_cats:
            return False

        # Price filters
        if p_min is not None and line.price_unit < p_min:
            return False
        if p_max is not None and p_max > 0 and line.price_unit > p_max:
            return False

        # Discount filters
        disc = line.discount or 0.0
        if d_filter == 'discounted' and disc <= 0:
            return False
        elif d_filter == 'no_discount' and disc > 0:
            return False
        elif d_filter == 'custom_range':
            if disc < d_min or disc > d_max:
                return False

        return True

    def _compute_line_taxes(self, line, price_subtotal, currency):
        """
        Calculates exact tax breakdown for a line subtotal using fiscal position taxes.
        """
        taxes_res = []
        if line.tax_ids_after_fiscal_position:
            # We compute taxes on the subtotal directly or unit price
            line_taxes = line.tax_ids_after_fiscal_position.sudo().compute_all(
                price_subtotal,
                currency,
                quantity=1.0,
                product=line.product_id,
                partner=line.order_id.partner_id or False,
                is_refund=(line.qty < 0)
            )
            tax_records = {t.id: t for t in line.tax_ids_after_fiscal_position}
            for tax in line_taxes['taxes']:
                t_rec = tax_records.get(tax['id']) or self.env['account.tax'].browse(tax['id'])
                taxes_res.append({
                    'id': tax['id'],
                    'name': tax['name'],
                    'rate': t_rec.amount if t_rec else 0.0,
                    'base': tax['base'],
                    'amount': tax['amount'],
                })
        else:
            taxes_res.append({
                'id': 0,
                'name': _('No Tax / Exempt'),
                'rate': 0.0,
                'base': price_subtotal,
                'amount': 0.0,
            })
        return taxes_res

    def _process_standalone_line(
        self, line, currency,
        pos_cats, prod_cats, prods,
        p_min, p_max, d_filter, d_min, d_max,
        categories_map, taxes_dict, global_consumption
    ):
        if not self._line_matches_filters(line, pos_cats, prod_cats, prods, p_min, p_max, d_filter, d_min, d_max):
            return

        product = line.product_id
        cat_name = self._get_category_name(product)
        subtotal = line.price_subtotal
        gross = line.price_subtotal_incl
        tax_amount = gross - subtotal
        qty = line.qty

        # Taxes accumulation
        taxes_info = self._compute_line_taxes(line, subtotal, currency)
        for t in taxes_info:
            taxes_dict[t['id']]['name'] = t['name']
            taxes_dict[t['id']]['rate'] = t['rate']
            taxes_dict[t['id']]['base'] += t['base']
            taxes_dict[t['id']]['tax'] += t['amount']

        # Category accumulation
        s_entry = categories_map[cat_name]['standalone'][product.id]
        s_entry['product'] = product
        s_entry['qty'] += qty
        s_entry['price_unit'] = line.price_unit
        s_entry['discount'] = line.discount
        s_entry['subtotal'] += subtotal
        s_entry['tax'] += tax_amount
        s_entry['gross'] += gross

        # Global consumption accumulation
        g_entry = global_consumption[product.id]
        g_entry['product'] = product
        g_entry['category_name'] = cat_name
        g_entry['standalone_qty'] += qty
        g_entry['total_qty'] += qty
        g_entry['subtotal'] += subtotal
        g_entry['tax'] += tax_amount
        g_entry['gross'] += gross

    def _process_combo_line(
        self, parent_line, children_lines, revenue_attribution, currency,
        pos_cats, prod_cats, prods,
        p_min, p_max, d_filter, d_min, d_max,
        categories_map, taxes_dict, global_consumption
    ):
        parent_product = parent_line.product_id
        parent_cat_name = self._get_category_name(parent_product)

        # Check if parent matches or any child matches (cross-category filter inclusion!)
        parent_matches = self._line_matches_filters(parent_line, pos_cats, prod_cats, prods, p_min, p_max, d_filter, d_min, d_max)
        
        matching_children = []
        for child in children_lines:
            child_matches = self._line_matches_filters(child, pos_cats, prod_cats, prods, None, None, d_filter, d_min, d_max)
            # If no specific category/product filter, all children match
            if not pos_cats and not prod_cats and not prods:
                matching_children.append((child, True))
            else:
                matching_children.append((child, child_matches or parent_matches))

        # If neither parent nor any child matches, skip this combo
        if not parent_matches and not any(m[1] for m in matching_children):
            return

        parent_subtotal = parent_line.price_subtotal
        parent_gross = parent_line.price_subtotal_incl
        parent_qty = parent_line.qty

        # Mode 1: Menu-Level Revenue Attribution
        if revenue_attribution == 'menu_level':
            # Parent carries base combo revenue
            parent_tax = parent_gross - parent_subtotal
            taxes_info = self._compute_line_taxes(parent_line, parent_subtotal, currency)
            for t in taxes_info:
                taxes_dict[t['id']]['name'] = t['name']
                taxes_dict[t['id']]['rate'] = t['rate']
                taxes_dict[t['id']]['base'] += t['base']
                taxes_dict[t['id']]['tax'] += t['amount']

            c_entry = categories_map[parent_cat_name]['combos'][parent_product.id]
            c_entry['product'] = parent_product
            c_entry['qty'] += parent_qty
            c_entry['price_unit'] = parent_line.price_unit
            c_entry['subtotal'] += parent_subtotal
            c_entry['tax'] += parent_tax
            c_entry['gross'] += parent_gross

            # Global consumption for menu itself
            g_entry = global_consumption[parent_product.id]
            g_entry['product'] = parent_product
            g_entry['category_name'] = parent_cat_name
            g_entry['standalone_qty'] += parent_qty
            g_entry['total_qty'] += parent_qty
            g_entry['subtotal'] += parent_subtotal
            g_entry['tax'] += parent_tax
            g_entry['gross'] += parent_gross

            # Process children components
            for child, is_included in matching_children:
                if not is_included:
                    continue
                child_prod = child.product_id
                child_qty = child.qty
                # Any extra price on child (e.g. +0.20 for cheese or extra monster price)
                extra_subtotal = child.price_subtotal
                extra_gross = child.price_subtotal_incl
                extra_tax = extra_gross - extra_subtotal

                if extra_subtotal > 0:
                    child_taxes = self._compute_line_taxes(child, extra_subtotal, currency)
                    for t in child_taxes:
                        taxes_dict[t['id']]['name'] = t['name']
                        taxes_dict[t['id']]['rate'] = t['rate']
                        taxes_dict[t['id']]['base'] += t['base']
                        taxes_dict[t['id']]['tax'] += t['amount']

                # Register component under parent combo
                comp_entry = c_entry['components'][child_prod.id]
                comp_entry['product'] = child_prod
                comp_entry['qty'] += child_qty
                comp_entry['extra_price'] = child.price_unit if extra_subtotal > 0 else 0.0
                comp_entry['subtotal'] += extra_subtotal
                comp_entry['tax'] += extra_tax
                comp_entry['gross'] += extra_gross

                # Track in-combo quantity for the standalone category entry as well
                child_cat_name = self._get_category_name(child_prod)
                categories_map[child_cat_name]['standalone'][child_prod.id]['product'] = child_prod
                categories_map[child_cat_name]['standalone'][child_prod.id]['in_combo_qty'] += child_qty

                # Global consumption for component
                cg_entry = global_consumption[child_prod.id]
                cg_entry['product'] = child_prod
                cg_entry['category_name'] = child_cat_name
                cg_entry['combo_qty'] += child_qty
                cg_entry['total_qty'] += child_qty
                cg_entry['subtotal'] += extra_subtotal
                cg_entry['tax'] += extra_tax
                cg_entry['gross'] += extra_gross

        # Mode 2: Prorated Revenue Attribution
        else:
            # Menu price is split proportionally among chosen components based on their list price
            c_entry = categories_map[parent_cat_name]['combos'][parent_product.id]
            c_entry['product'] = parent_product
            c_entry['qty'] += parent_qty
            c_entry['price_unit'] = parent_line.price_unit
            c_entry['subtotal'] += 0.0  # Revenue distributed to children
            c_entry['tax'] += 0.0
            c_entry['gross'] += 0.0

            # Global consumption for menu itself (quantity only)
            g_entry = global_consumption[parent_product.id]
            g_entry['product'] = parent_product
            g_entry['category_name'] = parent_cat_name
            g_entry['standalone_qty'] += parent_qty
            g_entry['total_qty'] += parent_qty

            valid_children = [c for c, inc in matching_children if inc]
            if not valid_children:
                return

            total_list_price = sum(c.product_id.lst_price or 1.0 for c in valid_children)

            for child in valid_children:
                child_prod = child.product_id
                child_qty = child.qty
                ratio = (child_prod.lst_price or 1.0) / total_list_price if total_list_price > 0 else (1.0 / len(valid_children))
                
                # Prorated share of base menu + any extra price
                prorated_subtotal = (parent_subtotal * ratio) + child.price_subtotal
                child_taxes = self._compute_line_taxes(child, prorated_subtotal, currency)
                prorated_tax = sum(t['amount'] for t in child_taxes)
                prorated_gross = prorated_subtotal + prorated_tax

                for t in child_taxes:
                    taxes_dict[t['id']]['name'] = t['name']
                    taxes_dict[t['id']]['rate'] = t['rate']
                    taxes_dict[t['id']]['base'] += t['base']
                    taxes_dict[t['id']]['tax'] += t['amount']

                # Register component under parent combo
                comp_entry = c_entry['components'][child_prod.id]
                comp_entry['product'] = child_prod
                comp_entry['qty'] += child_qty
                comp_entry['extra_price'] = child.price_unit if child.price_subtotal > 0 else 0.0
                comp_entry['subtotal'] += prorated_subtotal
                comp_entry['tax'] += prorated_tax
                comp_entry['gross'] += prorated_gross

                # Track in-combo quantity for the component's category entry
                child_cat_name = self._get_category_name(child_prod)
                child_s_entry = categories_map[child_cat_name]['standalone'][child_prod.id]
                child_s_entry['product'] = child_prod
                child_s_entry['in_combo_qty'] += child_qty

                # Global consumption for component
                cg_entry = global_consumption[child_prod.id]
                cg_entry['product'] = child_prod
                cg_entry['category_name'] = child_cat_name
                cg_entry['combo_qty'] += child_qty
                cg_entry['total_qty'] += child_qty
                cg_entry['subtotal'] += prorated_subtotal
                cg_entry['tax'] += prorated_tax
                cg_entry['gross'] += prorated_gross

