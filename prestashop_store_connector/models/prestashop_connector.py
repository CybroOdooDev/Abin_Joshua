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

import requests
from prestapyt import (
    PrestaShopAuthenticationError,
    PrestaShopWebServiceDict,
    PrestaShopWebServiceError,
)

from odoo import api, fields, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

PRESTASHOP_ERRORS = (
    PrestaShopWebServiceError,
    PrestaShopAuthenticationError,
    requests.RequestException,
    OSError,
    ValueError,
    TypeError,
    KeyError,
)


class PrestashopConnector(models.Model):
    """Manage PrestaShop store instances and bidirectional synchronization."""

    _name = 'prestashop.connector'
    _description = 'Prestashop Connector'

    name = fields.Char(
        string='Instance Name',
        required=True,
        help="Name of the PrestaShop store instance.",
    )
    api_url = fields.Char(
        string="API URL",
        required=True,
        help="PrestaShop Webservice API URL.",
    )
    api_key = fields.Char(
        string="API KEY",
        required=True,
        groups='base.group_system',
        help="PrestaShop Webservice API key.",
    )
    state = fields.Selection(
        selection=[
            ('not_connected', 'Not Connected'),
            ('connected', 'Connected'),
        ],
        default='not_connected',
        help="Connection state of the PrestaShop instance.",
    )
    company_id = fields.Many2one(
        'res.company',
        default=lambda self: self.env.company,
        help="Company associated with this PrestaShop instance.",
    )
    import_products_button = fields.Boolean(
        string="Import Products",
        help="Enable importing products from PrestaShop.",
    )
    export_products_button = fields.Boolean(
        string="Export Products",
        help="Enable exporting products to PrestaShop.",
    )
    is_product_imported = fields.Boolean(
        help="Indicate whether any products were imported in the last run.",
    )
    is_product_exported = fields.Boolean(
        help="Indicate whether any products were exported in the last run.",
    )
    import_contacts_button = fields.Boolean(
        string='Import Contacts',
        help="Enable importing customers from PrestaShop.",
    )
    export_contacts_button = fields.Boolean(
        string='Export Contacts',
        help="Enable exporting contacts to PrestaShop.",
    )
    is_contacts_imported = fields.Boolean(
        help="Indicate whether any contacts were imported in the last run.",
    )
    is_contacts_exported = fields.Boolean(
        help="Indicate whether any contacts were exported in the last run.",
    )
    import_orders_button = fields.Boolean(
        string='Import Orders',
        help="Enable importing sales orders from PrestaShop.",
    )
    export_orders_button = fields.Boolean(
        string='Export Orders',
        help="Enable exporting sales orders to PrestaShop.",
    )
    is_order_imported = fields.Boolean(
        help="Indicate whether any orders were imported in the last run.",
    )
    is_order_exported = fields.Boolean(
        help="Indicate whether any orders were exported in the last run.",
    )

    def _get_prestashop_client(self):
        """Return an authenticated PrestaShop Webservice client."""
        return PrestaShopWebServiceDict(self.api_url, self.api_key)

    def _notify(self, message, notification_type='success', title=None, sticky=False):
        """Build a standard Odoo client notification action."""
        params = {
            'message': message,
            'type': notification_type,
            'sticky': sticky,
        }
        if title:
            params['title'] = title
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': params,
        }

    def _not_connected_notification(self):
        """Return a standard warning notification for disconnected instances."""
        return self._notify(
            self.env._("Instance is not connected with PrestaShop!"),
            notification_type='danger',
        )

    @staticmethod
    def _ensure_list(value):
        """Normalize single dictionary or missing responses into a list."""
        if not value:
            return []
        return value if isinstance(value, list) else [value]

    @staticmethod
    def _split_partner_name(full_name):
        """Split a partner name into sanitized PrestaShop first/last names."""
        raw_name = full_name or "nil nil"
        parts = raw_name.split()
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else first_name
        if "." in first_name or "(" in first_name:
            first_name = first_name.split(".")[0].split("(")[0]
        if "(" in last_name or "." in last_name:
            last_name = last_name.split("(")[0].split(".")[0]
        return first_name or "Customer", last_name or first_name or "Customer"

    @staticmethod
    def _extract_language_value(node, fallback=""):
        """Extract text from a PrestaShop multilingual language node."""
        if isinstance(node, dict) and 'language' in node:
            langs = node['language']
            if isinstance(langs, list) and langs:
                return langs[0].get('value', fallback)
            if isinstance(langs, dict):
                return langs.get('value', fallback)
        return fallback

    @staticmethod
    def _prepare_product_payload(product):
        """Build the PrestaShop XML/dict payload for an Odoo product."""
        price = product.lst_price
        wholesale_price = product.standard_price
        name = product.name
        reference = product.description_sale or product.default_code or name
        if reference:
            reference = str(reference)[:64]
        lang_entries = [{'attrs': {'id': str(idx)}, 'value': name} for idx in range(1, 5)]
        return {
            'product': {
                'id_shop_default': '1',
                'state': '1',
                'price': round(price, 2),
                'reference': reference,
                'wholesale_price': wholesale_price,
                'active': '1',
                'available_for_order': '1',
                'show_price': '1',
                'indexed': '1',
                'visibility': 'both',
                'link_rewrite': {'language': lang_entries},
                'name': {'language': lang_entries},
            },
        }

    @staticmethod
    def _prepare_customer_payload(partner, first_name, last_name):
        """Build the PrestaShop customer creation payload."""
        email_to_use = (
            partner.email.strip()
            if partner.email
            else f"{first_name}_{partner.id}_pleasechange@email.com"
        )
        return {
            'firstname': first_name,
            'lastname': last_name,
            'email': email_to_use,
            'passwd': '',
            'active': 1,
            'company': partner.company_id.name or " ",
            'id_default_group': 3,
        }

    def _get_stock_location(self):
        """Resolve the internal stock location for imported product quants."""
        stock_location = self.env.ref(
            'stock.stock_location_stock',
            raise_if_not_found=False,
        )
        if not stock_location:
            company = self.company_id or self.env.company
            stock_location = self.env['stock.warehouse'].search(
                [('company_id', '=', company.id)],
                limit=1,
            ).lot_stock_id
        if not stock_location:
            company = self.company_id or self.env.company
            raise UserError(
                self.env._(
                    "No internal stock location found for company %(company)s.",
                    company=company.name,
                ),
            )
        return stock_location

    def _export_partner_address(self, presta, partner, first_name, last_name, street_fallback=False):
        """Create a PrestaShop address record for a synced partner."""
        country_ids = (
            presta.search('countries', {'filter[name]': partner.country_id.name})
            if partner.country_id
            else []
        )
        state_ids = (
            presta.search('states', {'filter[name]': partner.state_id.name})
            if partner.state_id
            else []
        )
        address1 = (partner.street or partner.city) if street_fallback else partner.city
        address_payload = {
            'address': {
                'id_customer': partner.prestashop,
                'id_country': country_ids[0] if country_ids else 21,
                'id_state': state_ids[0] if state_ids else 1,
                'alias': 'my address',
                'lastname': last_name,
                'firstname': first_name,
                'address1': address1 or "please change",
                'city': partner.city or "please change",
            },
        }
        presta.add('addresses', address_payload)

    def _sync_order_delivery_and_discount(self, sale_order, shipping, discount):
        """Attach PrestaShop shipping and discount lines to an imported sale order."""
        shipping_amount = float(shipping or 0.0)
        if shipping_amount > 0.0:
            carrier = self.env['delivery.carrier'].search(
                [
                    ('is_prestashop_carrier', '=', True),
                    ('name', '=', 'Delivery(Prestashop)'),
                ],
                limit=1,
            )
            if not carrier:
                delivery_product = self.env['product.product'].search(
                    [
                        ('is_delivery_product', '=', True),
                        ('type', '=', 'service'),
                        ('default_code', '=', 'Prestashop'),
                    ],
                    limit=1,
                )
                if not delivery_product:
                    delivery_product = self.env['product.product'].create({
                        'name': 'Delivery charges',
                        'default_code': 'Prestashop',
                        'type': 'service',
                        'is_delivery_product': True,
                    })
                carrier = self.env['delivery.carrier'].create({
                    'name': 'Delivery(Prestashop)',
                    'product_id': delivery_product.id,
                    'is_prestashop_carrier': True,
                })
            sale_order.set_delivery_line(carrier, shipping_amount)
            delivery_lines = sale_order.order_line.filtered(lambda line: line.is_delivery)
            if delivery_lines:
                delivery_lines.write({
                    'price_unit': shipping_amount,
                    'tax_ids': False,
                })

        discount_amount = float(discount or 0.0)
        if discount_amount > 0.0:
            discount_product = self.env['product.product'].search(
                [
                    ('is_discount_product', '=', True),
                    ('type', '=', 'service'),
                ],
                limit=1,
            )
            if not discount_product:
                discount_product = self.env['product.product'].create({
                    'name': 'Discounts',
                    'type': 'service',
                    'is_discount_product': True,
                    'default_code': 'Prestashop',
                })
            sale_order.update({
                'order_line': [
                    fields.Command.create({
                        'product_id': discount_product.id,
                        'product_uom_qty': 1,
                        'price_unit': -abs(discount_amount),
                        'name': discount_product.name,
                        'sequence': 500,
                        'tax_ids': False,
                    }),
                ],
            })

    def action_connect(self):
        """Connect the PrestaShop instance and verify API credentials."""
        self.ensure_one()
        try:
            prestashop = self._get_prestashop_client()
            shop_info = prestashop.get('shops')
            if shop_info:
                self.write({'state': 'connected'})
        except PRESTASHOP_ERRORS as error:
            raise UserError(
                self.env._("Failed to connect to PrestaShop: %(error)s", error=error),
            ) from error

    @api.constrains('api_url', 'api_key')
    def _check_connection(self):
        """Validate PrestaShop connection credentials on create or write."""
        for record in self:
            try:
                prestashop = record._get_prestashop_client()
                prestashop.get('shops')
            except PRESTASHOP_ERRORS as error:
                raise UserError(
                    self.env._("Invalid PrestaShop API credentials: %(error)s", error=error),
                ) from error

    def action_import_products(self):
        """Import products and stock levels from PrestaShop into Odoo."""
        self.ensure_one()
        if self.state == 'not_connected':
            return self._not_connected_notification()
        try:
            presta = self._get_prestashop_client()
            products = presta.get('products')
            product_entries = self._ensure_list(
                products.get('products', {}).get('product', []),
            )
            self.is_product_imported = False
            stock_location = self._get_stock_location()

            for entry in product_entries:
                presta_id = entry['attrs']['id']
                product_data = presta.get('products', presta_id)['product']
                sales_price = float(product_data.get('price') or 0.0)
                product_weight = float(product_data.get('weight') or 0.0)
                cost_price = float(product_data.get('wholesale_price') or 0.0)
                stock_availables = presta.get(
                    'stock_availables',
                    options={'filter[id_product]': presta_id},
                )
                stock_nodes = self._ensure_list(
                    stock_availables.get('stock_availables', {}).get('stock_available', []),
                )
                available_quantity = 0.0
                if stock_nodes:
                    stock_id = stock_nodes[0]['attrs']['id']
                    qty_val = presta.get('stock_availables', stock_id)['stock_available']['quantity']
                    available_quantity = float(qty_val or 0.0)
                name = self._extract_language_value(
                    product_data.get('name', {}),
                    fallback=f"PrestaShop Product {presta_id}",
                )
                existing_product = self.env['product.product'].search(
                    [('prestashop', '=', int(presta_id))],
                    limit=1,
                )
                if not existing_product:
                    self.is_product_imported = True
                    created_product = self.env['product.product'].create({
                        'name': name,
                        'list_price': sales_price,
                        'standard_price': cost_price,
                        'type': 'consu',
                        'is_storable': True,
                        'weight': product_weight,
                        'prestashop': int(presta_id),
                    })
                    self.env['stock.quant'].create({
                        'product_id': created_product.id,
                        'quantity': available_quantity,
                        'location_id': stock_location.id,
                    })
                else:
                    quants = self.env['stock.quant'].search([
                        ('product_id', '=', existing_product.id),
                        ('location_id', '=', stock_location.id),
                    ])
                    if quants:
                        quants.write({'quantity': available_quantity})

            if self.is_product_imported:
                return self._notify(self.env._("Products imported successfully."))
            return self._notify(
                self.env._("No new products to import."),
                notification_type='danger',
            )
        except PrestaShopWebServiceError as error:
            raise UserError(
                self.env._("Failed to import products: %(error)s", error=error),
            ) from error

    def action_export_products(self):
        """Export Odoo products to PrestaShop."""
        self.ensure_one()
        if self.state == 'not_connected':
            return self._not_connected_notification()
        try:
            presta = self._get_prestashop_client()
            self.is_product_exported = False
            products = self.env['product.product'].search([
                ('is_delivery_product', '=', False),
                ('is_discount_product', '=', False),
            ])
            for product in products:
                existing_product = (
                    presta.search('products', {'filter[id]': product.prestashop})
                    if product.prestashop
                    else []
                )
                if not existing_product:
                    self.is_product_exported = True
                    payload = self._prepare_product_payload(product)
                    response = presta.add('products', payload)
                    presta_product_id = response['prestashop']['product']['id']
                    product.write({'prestashop': int(presta_product_id)})

            if self.is_product_exported:
                return self._notify(self.env._("Products exported successfully."))
            return self._notify(
                self.env._("There are no new products to export."),
                notification_type='danger',
            )
        except PrestaShopWebServiceError as error:
            raise UserError(
                self.env._("Failed to export products: %(error)s", error=error),
            ) from error

    def action_import_contacts(self):
        """Import customers from PrestaShop into Odoo contacts."""
        self.ensure_one()
        if self.state == 'not_connected':
            return self._not_connected_notification()
        try:
            presta = self._get_prestashop_client()
            customers = presta.get('customers')
            customer_entries = self._ensure_list(
                customers.get('customers', {}).get('customer', []),
            )
            self.is_contacts_imported = False
            for entry in customer_entries:
                cust_id = entry['attrs']['id']
                customer = presta.get('customers', cust_id)['customer']
                first_name = customer.get('firstname', '')
                last_name = customer.get('lastname', '')
                email = customer.get('email', '')
                name = f"{first_name} {last_name}".strip()
                existing_partner = self.env['res.partner'].search(
                    [('prestashop', '=', int(cust_id))],
                    limit=1,
                )
                if not existing_partner:
                    self.is_contacts_imported = True
                    self.env['res.partner'].create({
                        'name': name,
                        'email': email,
                        'prestashop': int(customer['id']),
                    })

            if self.is_contacts_imported:
                return self._notify(self.env._("Contacts imported successfully."))
            return self._notify(
                self.env._("There are no new contacts to import."),
                notification_type='danger',
            )
        except PrestaShopWebServiceError as error:
            raise UserError(
                self.env._("Failed to import contacts: %(error)s", error=error),
            ) from error

    def action_export_contacts(self):
        """Export Odoo contacts and addresses to PrestaShop."""
        self.ensure_one()
        if self.state == 'not_connected':
            return self._not_connected_notification()
        try:
            self.is_contacts_exported = False
            presta = self._get_prestashop_client()

            for customer in self.env['res.partner'].search([], limit=None):
                first_name, last_name = self._split_partner_name(customer.name)
                existing_customer = (
                    presta.search('customers', {'filter[id]': customer.prestashop})
                    if customer.prestashop
                    else False
                )

                if not existing_customer and customer.email:
                    email_clean = customer.email.strip()
                    existing_customer = presta.search('customers', {'filter[email]': email_clean})
                    if existing_customer:
                        customer.write({'prestashop': int(existing_customer[0])})
                        self.is_contacts_exported = True

                if not existing_customer:
                    new_customer = self._prepare_customer_payload(
                        customer,
                        first_name,
                        last_name,
                    )
                    try:
                        created = presta.add('customers', {'customer': new_customer})
                        customer.write({
                            'prestashop': int(created['prestashop']['customer']['id']),
                        })
                        self.is_contacts_exported = True
                    except PrestaShopWebServiceError as error:
                        err_lower = str(error).lower()
                        if ('email' in err_lower or 'already used' in err_lower) and customer.email:
                            email_clean = customer.email.strip()
                            existing = (
                                presta.search('customers', {'filter[email]': email_clean})
                                or presta.search('customers', {'filter[email]': f'[{email_clean}]'})
                            )
                            if existing:
                                customer.write({'prestashop': int(existing[0])})
                                self.is_contacts_exported = True
                        else:
                            raise UserError(
                                self.env._(
                                    "Failed to export contact '%(name)s': %(error)s",
                                    name=customer.name,
                                    error=error,
                                ),
                            ) from error

                if customer.prestashop:
                    existing_address = presta.search(
                        'addresses',
                        {'filter[id_customer]': customer.prestashop},
                    )
                    if not existing_address:
                        try:
                            self._export_partner_address(
                                presta,
                                customer,
                                first_name,
                                last_name,
                            )
                        except PrestaShopWebServiceError as error:
                            raise UserError(
                                self.env._(
                                    "Failed to export address for '%(name)s'. Ensure the API "
                                    "key has permissions for 'addresses', 'countries', and "
                                    "'states'. Original error: %(error)s",
                                    name=customer.name,
                                    error=error,
                                ),
                            ) from error

            if self.is_contacts_exported:
                return self._notify(self.env._("Contacts exported successfully."))
            return self._notify(
                self.env._("There are no new contacts to export."),
                notification_type='danger',
            )
        except PrestaShopWebServiceError as error:
            raise UserError(
                self.env._("Failed to export contacts: %(error)s", error=error),
            ) from error

    def _get_or_create_order_product(self, presta, product_presta_id, reference=""):
        """Find or import a product referenced by an imported PrestaShop order."""
        presta_id_int = int(product_presta_id) if str(product_presta_id).isdigit() else 0
        prod = self.env['product.product'].search(
            [('prestashop', '=', presta_id_int)],
            limit=1,
        )
        if not prod:
            fallback_name = reference or f"PrestaShop Product {product_presta_id}"
            try:
                p_res = presta.get('products', product_presta_id)
                p_info = p_res.get('product', {})
                name_str = self._extract_language_value(
                    p_info.get('name', {}),
                    fallback=fallback_name,
                )
            except PRESTASHOP_ERRORS as error:
                _logger.warning(
                    "Could not fetch PrestaShop product %s during order import: %s",
                    product_presta_id,
                    error,
                )
                name_str = fallback_name
            prod = self.env['product.product'].create({
                'name': name_str,
                'prestashop': presta_id_int,
            })
        return prod.id

    def _get_or_create_order_partner(self, presta, customer_id):
        """Find or import a customer referenced by an imported PrestaShop order."""
        cust_id_int = int(customer_id) if str(customer_id).isdigit() else 0
        partner = self.env['res.partner'].search(
            [('prestashop', '=', cust_id_int)],
            limit=1,
        )
        if partner:
            return partner
        try:
            cust_res = presta.get('customers', customer_id)
            cust_info = cust_res.get('customer', {})
            first_name = cust_info.get('firstname', '')
            last_name = cust_info.get('lastname', '')
            email = cust_info.get('email', '')
            name = f"{first_name} {last_name}".strip() or f"PrestaShop Customer {customer_id}"
            if email:
                partner = self.env['res.partner'].search([('email', '=', email)], limit=1)
            if partner:
                partner.write({'prestashop': cust_id_int})
                return partner
            return self.env['res.partner'].create({
                'name': name,
                'email': email,
                'prestashop': cust_id_int,
            })
        except PRESTASHOP_ERRORS as error:
            _logger.warning(
                "Could not fetch PrestaShop customer %s during order import: %s",
                customer_id,
                error,
            )
            return self.env['res.partner'].create({
                'name': f"PrestaShop Customer ({customer_id})",
                'prestashop': cust_id_int,
            })

    def action_import_orders(self):
        """Import active PrestaShop orders as Odoo quotations."""
        self.ensure_one()
        if self.state == 'not_connected':
            return self._not_connected_notification()
        try:
            presta = self._get_prestashop_client()
            orders = presta.get('orders')
            orders_data = self._ensure_list(orders.get('orders', {}).get('order', []))
            self.is_order_imported = False

            for entry in orders_data:
                presta_order_id = entry['attrs']['id']
                order_data = presta.get('orders', presta_order_id)['order']
                if str(order_data['current_state']) == '6':
                    continue

                partner = self._get_or_create_order_partner(presta, order_data['id_customer'])
                order_id = int(order_data['id'])
                shipping = order_data.get('total_shipping_tax_incl', 0.0)
                discount = order_data.get('total_discounts_tax_incl', 0.0)

                existing_so = self.env['sale.order'].search(
                    [('prestashop', '=', order_id)],
                    limit=1,
                )
                if existing_so:
                    continue

                self.is_order_imported = True
                sale_order = self.env['sale.order'].create({
                    'prestashop': order_id,
                    'partner_id': partner.id,
                })
                self._sync_order_delivery_and_discount(sale_order, shipping, discount)

                order_rows = self._ensure_list(
                    order_data.get('associations', {}).get('order_rows', {}).get('order_row', []),
                )
                line_commands = []
                for order_line in order_rows:
                    prod_id = self._get_or_create_order_product(
                        presta,
                        order_line.get('product_id'),
                        order_line.get('product_reference', ''),
                    )
                    line_commands.append(
                        fields.Command.create({
                            'product_id': prod_id,
                            'product_uom_qty': float(order_line.get('product_quantity', 1)),
                            'name': order_line.get('product_reference') or "PrestaShop Item",
                            'sequence': 1,
                            'tax_ids': False,
                        }),
                    )
                if line_commands:
                    sale_order.update({'order_line': line_commands})

            if self.is_order_imported:
                return self._notify(self.env._("Orders imported successfully."))
            return self._notify(
                self.env._("There are no new orders to import."),
                notification_type='danger',
            )
        except PrestaShopWebServiceError as error:
            raise UserError(
                self.env._("Failed to import orders: %(error)s", error=error),
            ) from error

    def _ensure_partner_for_order_export(self, presta, partner):
        """Ensure the customer exists on PrestaShop and return its external ID."""
        if not partner.prestashop:
            if partner.email:
                email_clean = partner.email.strip()
                existing_cust = (
                    presta.search('customers', {'filter[email]': email_clean})
                    or presta.search('customers', {'filter[email]': f'[{email_clean}]'})
                )
                if existing_cust:
                    partner.write({'prestashop': int(existing_cust[0])})
            if not partner.prestashop:
                first_name, last_name = self._split_partner_name(partner.name)
                new_cust = self._prepare_customer_payload(partner, first_name, last_name)
                try:
                    c_resp = presta.add('customers', {'customer': new_cust})
                    partner.write({
                        'prestashop': int(c_resp['prestashop']['customer']['id']),
                    })
                except PrestaShopWebServiceError as error:
                    err_lower = str(error).lower()
                    if ('email' in err_lower or 'already used' in err_lower) and partner.email:
                        email_clean = partner.email.strip()
                        existing = (
                            presta.search('customers', {'filter[email]': email_clean})
                            or presta.search('customers', {'filter[email]': f'[{email_clean}]'})
                        )
                        if existing:
                            partner.write({'prestashop': int(existing[0])})
        return partner.prestashop

    def _ensure_address_for_order_export(self, presta, partner):
        """Find or create a PrestaShop address for the given partner."""
        id_address = presta.search('addresses', {'filter[id_customer]': partner.prestashop})
        if not id_address:
            first_name, last_name = self._split_partner_name(partner.name)
            try:
                self._export_partner_address(
                    presta,
                    partner,
                    first_name,
                    last_name,
                    street_fallback=True,
                )
                id_address = presta.search('addresses', {'filter[id_customer]': partner.prestashop})
            except PRESTASHOP_ERRORS as error:
                _logger.warning(
                    "Failed to create address for customer '%s' during order export: %s",
                    partner.name,
                    error,
                )
        return id_address

    def _check_delivery_country_active(self, presta, sale_order, id_address):
        """Return a skip reason if the PrestaShop delivery country is disabled."""
        try:
            address_detail = presta.get('addresses', id_address[0])
            id_country = address_detail['address'].get('id_country', 0)
            if id_country:
                country_detail = presta.get('countries', id_country)
                country_name = self._extract_language_value(
                    country_detail['country'].get('name', {}),
                    fallback=f"ID {id_country}",
                )
                if str(country_detail['country'].get('active', '0')) == '0':
                    return (
                        f"Delivery address country '{country_name}' is not active in "
                        "PrestaShop. Please enable it under International > Countries."
                    )
        except PRESTASHOP_ERRORS as error:
            _logger.warning(
                "Could not verify country status for order '%s': %s",
                sale_order.name,
                error,
            )
        return None

    def action_export_orders(self):
        """Export confirmed Odoo sales orders to PrestaShop."""
        self.ensure_one()
        if self.state == 'not_connected':
            return self._not_connected_notification()
        try:
            presta = self._get_prestashop_client()
            self.is_order_exported = False
            skipped_orders = []

            for sale_order in self.env['sale.order'].search([('state', '=', 'sale')]):
                if sale_order.prestashop and presta.search('orders', {'filter[id]': sale_order.prestashop}):
                    continue

                partner = sale_order.partner_id
                id_customer = self._ensure_partner_for_order_export(presta, partner)
                if not id_customer:
                    skipped_orders.append((
                        sale_order.name,
                        f"Customer '{partner.name}' could not be created/found in PrestaShop",
                    ))
                    continue

                id_address = self._ensure_address_for_order_export(presta, partner)
                if not id_address:
                    skipped_orders.append((
                        sale_order.name,
                        f"No address found in PrestaShop for customer '{partner.name}'",
                    ))
                    continue

                country_reason = self._check_delivery_country_active(presta, sale_order, id_address)
                if country_reason:
                    skipped_orders.append((sale_order.name, country_reason))
                    continue

                if not sale_order.order_line:
                    continue

                for order_line in sale_order.order_line:
                    if not order_line.product_id.prestashop:
                        product = order_line.product_id
                        try:
                            p_res = presta.add('products', self._prepare_product_payload(product))
                            product.write({'prestashop': int(p_res['prestashop']['product']['id'])})
                        except PRESTASHOP_ERRORS as error:
                            _logger.warning(
                                "Failed to export product '%s' during order export: %s",
                                product.name,
                                error,
                            )

                cart_list = []
                missing_product = False
                for order_line in sale_order.order_line:
                    if not order_line.product_id.prestashop:
                        skipped_orders.append((
                            sale_order.name,
                            f"Product '{order_line.product_id.name}' is not exported to PrestaShop",
                        ))
                        missing_product = True
                        break
                    cart_list.append({
                        'id_product': order_line.product_id.prestashop,
                        'id_product_attribute': '0',
                        'id_address_delivery': id_address[0],
                        'id_customization': '0',
                        'price_with_tax': round(order_line.price_unit * order_line.product_uom_qty, 2),
                        'quantity': order_line.product_uom_qty,
                    })

                if missing_product:
                    continue

                existing_orders = (
                    presta.search('orders', {'filter[id]': sale_order.prestashop})
                    if sale_order.prestashop
                    else []
                )
                if not existing_orders:
                    cart_data = {
                        'id_currency': 1,
                        'id_lang': 1,
                        'id_customer': id_customer,
                        'id_address_invoice': id_address[0],
                        'associations': {
                            'cart_rows': {'cart_row': cart_list},
                        },
                    }
                    grand_total = round(
                        sale_order.amount_total
                        or sum(
                            line.product_id.lst_price * line.product_uom_qty
                            for line in sale_order.order_line
                        ),
                        2,
                    )
                    total_products = sum(sale_order.order_line.mapped('product_uom_qty'))
                    cart = presta.add('carts', {'cart': cart_data})
                    cart_id = cart['prestashop']['cart']['id']
                    new_order = {
                        'id_address_delivery': id_address[0],
                        'id_address_invoice': id_address[0],
                        'id_cart': cart_id,
                        'current_state': 1,
                        'id_currency': 1,
                        'id_lang': 1,
                        'id_customer': id_customer,
                        'id_carrier': 1,
                        'module': 'ps_wirepayment',
                        'payment': 'Bank Transfer',
                        'total_paid': grand_total,
                        'total_paid_real': grand_total,
                        'total_products': total_products,
                        'total_products_wt': grand_total,
                        'conversion_rate': 1,
                        'shipping_cost_tax_excl': 0,
                    }
                    order = presta.add('orders', {'order': new_order})
                    sale_order.write({'prestashop': int(order['prestashop']['order']['id'])})
                    self.is_order_exported = True

            skip_lines = '\n'.join(f"• {name}: {reason}" for name, reason in skipped_orders)
            if self.is_order_exported:
                if skipped_orders:
                    return self._notify(
                        self.env._(
                            "Some orders were exported successfully, but the following "
                            "were skipped:\n\n%(details)s",
                            details=skip_lines,
                        ),
                        notification_type='warning',
                        title=self.env._("Partial Export Warning"),
                        sticky=True,
                    )
                return self._notify(self.env._("Orders exported successfully."))
            if skipped_orders:
                return self._notify(
                    self.env._(
                        "No orders were exported. The following orders were skipped:\n\n%(details)s",
                        details=skip_lines,
                    ),
                    notification_type='danger',
                    title=self.env._("Order Export Skipped"),
                    sticky=True,
                )
            return self._notify(
                self.env._("There are no new orders to export."),
                notification_type='danger',
            )
        except PrestaShopWebServiceError as error:
            raise UserError(
                self.env._("Failed to export orders: %(error)s", error=error),
            ) from error
