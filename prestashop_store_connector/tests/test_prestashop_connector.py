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
from unittest.mock import MagicMock, patch

from prestapyt import PrestaShopWebServiceError

from odoo.exceptions import AccessError, UserError
from odoo.tests.common import TransactionCase, tagged

CLIENT_PATCH_PATH = (
    'odoo.addons.prestashop_store_connector.models.'
    'prestashop_connector.PrestaShopWebServiceDict'
)


@tagged('post_install', '-at_install')
class TestPrestashopConnector(TransactionCase):
    """Test cases for PrestashopConnector and related model extensions."""

    @classmethod
    def setUpClass(cls):
        """Create a PrestaShop connector record with mocked API validation."""
        super().setUpClass()
        mock_service = MagicMock()
        mock_service.get.return_value = {'shops': {}}
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            cls.connector = cls.env['prestashop.connector'].create({
                'name': 'Test Shop',
                'api_url': 'https://test.prestashop.com',
                'api_key': 'TESTKEY123',
            })

    def test_security_least_privilege(self):
        """Ensure connector records require system administrator privileges."""
        internal_user = self.env['res.users'].create({
            'name': 'Internal User',
            'login': 'presta_internal_user',
            'group_ids': [(6, 0, [self.env.ref('base.group_user').id])],
        })
        with self.assertRaises(AccessError):
            self.connector.with_user(internal_user).read(['name'])
        with self.assertRaises(AccessError):
            self.env['prestashop.connector'].with_user(internal_user).create({
                'name': 'Unauthorized Shop',
                'api_url': 'https://bad.prestashop.com',
                'api_key': 'BADKEY',
            })

    def test_product_and_carrier_copy_resets_prestashop(self):
        """Verify copying product variants and delivery carriers clears IDs."""
        product = self.env['product.product'].create({
            'name': 'Presta Product Copy',
            'prestashop': 4321,
        })
        copied_product = product.copy()
        self.assertFalse(copied_product.prestashop)

        carrier_product = self.env['product.product'].create({
            'name': 'Presta Carrier Service',
            'type': 'service',
        })
        carrier = self.env['delivery.carrier'].create({
            'name': 'Presta Carrier',
            'product_id': carrier_product.id,
            'prestashop': 9876,
            'is_prestashop_carrier': True,
        })
        copied_carrier = carrier.copy()
        self.assertFalse(copied_carrier.prestashop)

    def test_action_connect_and_failure(self):
        """Test action_connect updates state and handles API failures."""
        self.connector.state = 'not_connected'
        mock_service = MagicMock()
        mock_service.get.return_value = {'shops': {}}
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            self.connector.action_connect()
        self.assertEqual(self.connector.state, 'connected')

        mock_service.get.side_effect = PrestaShopWebServiceError('Timeout')
        with (
            patch(CLIENT_PATCH_PATH, return_value=mock_service),
            self.assertRaises(UserError),
        ):
            self.connector.action_connect()

    def test_check_connection_constraint_batch_and_error(self):
        """Test _check_connection handles batches and rejects bad keys."""
        mock_service = MagicMock()
        mock_service.get.return_value = {'shops': {}}
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            second = self.env['prestashop.connector'].create({
                'name': 'Batch Shop',
                'api_url': 'https://batch.prestashop.com',
                'api_key': 'BATCHKEY',
            })
            (self.connector | second)._check_connection()

        mock_service.get.side_effect = PrestaShopWebServiceError('Refused')
        with (
            patch(CLIENT_PATCH_PATH, return_value=mock_service),
            self.assertRaises(UserError),
        ):
            self.connector.write({'api_key': 'INVALID'})

    def test_not_connected_notifications(self):
        """Test all sync actions return a danger notice when disconnected."""
        self.connector.state = 'not_connected'
        for method_name in (
            'action_import_products',
            'action_export_products',
            'action_import_contacts',
            'action_export_contacts',
            'action_import_orders',
            'action_export_orders',
        ):
            result = getattr(self.connector, method_name)()
            self.assertEqual(result['params']['type'], 'danger')

    def test_action_import_products_branches(self):
        """Test importing new products and updating existing stock quants."""
        self.connector.state = 'connected'
        mock_service = MagicMock()
        mock_service.get.side_effect = [
            {'products': {'product': [{'attrs': {'id': '9101'}}]}},
            {
                'product': {
                    'price': '99.90',
                    'weight': '1.2',
                    'wholesale_price': '55.00',
                    'name': {'language': [{'value': 'Imported Presta Product'}]},
                },
            },
            {'stock_availables': {'stock_available': {'attrs': {'id': '201'}}}},
            {'stock_available': {'quantity': '5'}},
        ]
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            result = self.connector.action_import_products()
        self.assertEqual(result['params']['type'], 'success')
        self.assertTrue(self.connector.is_product_imported)
        imported = self.env['product.product'].search([('prestashop', '=', 9101)], limit=1)
        self.assertTrue(imported)
        self.assertEqual(imported.name, 'Imported Presta Product')

        mock_service.get.side_effect = [
            {'products': {'product': [{'attrs': {'id': '9101'}}]}},
            {
                'product': {
                    'price': '99.90',
                    'weight': '1.2',
                    'wholesale_price': '55.00',
                    'name': {'language': {'value': 'Imported Presta Product'}},
                },
            },
            {'stock_availables': {'stock_available': [{'attrs': {'id': '201'}}]}},
            {'stock_available': {'quantity': '8'}},
        ]
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            result = self.connector.action_import_products()
        self.assertEqual(result['params']['type'], 'danger')
        self.assertFalse(self.connector.is_product_imported)

        mock_service.get.side_effect = PrestaShopWebServiceError('API down')
        with (
            patch(CLIENT_PATCH_PATH, return_value=mock_service),
            self.assertRaises(UserError),
        ):
            self.connector.action_import_products()

    def test_action_export_products_branches(self):
        """Test exporting new products and skipping already-linked records."""
        self.connector.state = 'connected'
        product = self.env['product.product'].create({
            'name': 'Odoo Export Product',
            'list_price': 150.0,
            'standard_price': 100.0,
        })
        mock_service = MagicMock()
        mock_service.search.return_value = []
        mock_service.add.return_value = {'prestashop': {'product': {'id': 9991}}}
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            result = self.connector.action_export_products()
        self.assertEqual(result['params']['type'], 'success')
        self.assertTrue(self.connector.is_product_exported)
        self.assertEqual(product.prestashop, 9991)

        mock_service.search.return_value = [9991]
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            self.env['product.product'].search([
                '|',
                ('prestashop', '=', False),
                ('prestashop', '=', 0),
            ]).write({'prestashop': 9991})
            result = self.connector.action_export_products()
        self.assertEqual(result['params']['type'], 'danger')

    def test_action_import_contacts_branches(self):
        """Test importing new contacts and skipping existing contacts."""
        self.connector.state = 'connected'
        mock_service = MagicMock()
        mock_service.get.side_effect = [
            {'customers': {'customer': [{'attrs': {'id': '9301'}}]}},
            {
                'customer': {
                    'lastname': 'Imported',
                    'firstname': 'Customer',
                    'id': '9301',
                    'email': 'imported9301@example.com',
                },
            },
        ]
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            result = self.connector.action_import_contacts()
        self.assertEqual(result['params']['type'], 'success')
        self.assertTrue(self.connector.is_contacts_imported)
        partner = self.env['res.partner'].search([('prestashop', '=', 9301)], limit=1)
        self.assertTrue(partner)

        mock_service.get.side_effect = [
            {'customers': {'customer': [{'attrs': {'id': '9301'}}]}},
            {
                'customer': {
                    'lastname': 'Imported',
                    'firstname': 'Customer',
                    'id': '9301',
                    'email': 'imported9301@example.com',
                },
            },
        ]
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            result = self.connector.action_import_contacts()
        self.assertEqual(result['params']['type'], 'danger')

    def test_action_export_contacts_branches(self):
        """Test exporting contacts, duplicate recovery, and error paths."""
        self.connector.state = 'connected'
        self.env['res.partner'].search([
            '|',
            ('prestashop', '=', False),
            ('prestashop', '=', 0),
        ]).write({'prestashop': 9000})
        partner = self.env['res.partner'].create({
            'name': 'John Doe',
            'email': 'john.export@example.com',
            'city': 'Houston',
        })
        mock_service = MagicMock()
        mock_service.search.side_effect = lambda res, _flt: (
            [9000] if res == 'customers' and _flt.get('filter[id]') else
            ([1] if res == 'addresses' and _flt.get('filter[id_customer]') == 9000 else [])
        )
        mock_service.add.return_value = {'prestashop': {'customer': {'id': 9888}}}
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            result = self.connector.action_export_contacts()
        self.assertEqual(result['params']['type'], 'success')
        self.assertEqual(partner.prestashop, 9888)

        dup_partner = self.env['res.partner'].create({
            'name': 'Jane. (Dup)',
            'email': 'dup.export@example.com',
        })
        dup_search_calls = []

        def fake_search(resource, flt):
            """Simulate PrestaShop customer and address lookups."""
            if resource == 'customers' and flt.get('filter[id]') in (9000, 9888, 9777):
                return [flt['filter[id]']]
            if resource == 'addresses' and flt.get('filter[id_customer]') in (9000, 9888, 9777):
                return [1]
            if resource == 'customers' and flt.get('filter[email]') == 'dup.export@example.com':
                dup_search_calls.append(1)
                return [] if len(dup_search_calls) == 1 else [9777]
            return []

        mock_service.search.side_effect = fake_search
        mock_service.add.side_effect = [
            PrestaShopWebServiceError("The email is already used."),
            None,
        ]
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            result = self.connector.action_export_contacts()
        self.assertEqual(result['params']['type'], 'success')
        self.assertEqual(dup_partner.prestashop, 9777)

        self.env['res.partner'].create({
            'name': 'Err Contact',
            'email': 'err.export@example.com',
        })
        mock_service.search.side_effect = fake_search
        mock_service.add.side_effect = PrestaShopWebServiceError("Server error 500")
        with (
            patch(CLIENT_PATCH_PATH, return_value=mock_service),
            self.assertRaises(UserError),
        ):
            self.connector.action_export_contacts()

    def test_action_import_orders_branches(self):
        """Test importing orders with shipping/discount and cancelled skip."""
        self.connector.state = 'connected'
        partner = self.env['res.partner'].create({'name': 'Order Buyer', 'prestashop': 9401})
        product = self.env['product.product'].create({'name': 'Order Item', 'prestashop': 9501})
        mock_service = MagicMock()
        mock_service.get.return_value = {'orders': {}}
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            res_empty = self.connector.action_import_orders()
        self.assertEqual(res_empty['params']['type'], 'danger')

        mock_service.get.side_effect = [
            {'orders': {'order': [{'attrs': {'id': '9601'}}, {'attrs': {'id': '9602'}}]}},
            {
                'order': {
                    'current_state': 6,
                    'id_customer': 9401,
                    'id': '9601',
                    'total_shipping_tax_incl': '0.00',
                    'total_discounts_tax_incl': '0.00',
                    'associations': {'order_rows': {'order_row': []}},
                },
            },
            {
                'order': {
                    'current_state': 2,
                    'id_customer': 9401,
                    'id': '9602',
                    'total_shipping_tax_incl': '15.00',
                    'total_discounts_tax_incl': '5.00',
                    'associations': {
                        'order_rows': {
                            'order_row': {
                                'product_id': product.prestashop,
                                'product_quantity': 2,
                                'product_reference': 'Imported Row',
                            },
                        },
                    },
                },
            },
        ]
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            res_ok = self.connector.action_import_orders()
        self.assertEqual(res_ok['params']['type'], 'success')
        self.assertTrue(self.connector.is_order_imported)
        imported_order = self.env['sale.order'].search([('prestashop', '=', 9602)], limit=1)
        self.assertEqual(imported_order.partner_id, partner)
        self.assertGreaterEqual(len(imported_order.order_line), 3)

    def test_action_import_orders_creates_missing_partner_and_product(self):
        """Test order import creates missing partners and products."""
        self.connector.state = 'connected'
        mock_service = MagicMock()
        mock_service.get.side_effect = [
            {'orders': {'order': {'attrs': {'id': '9603'}}}},
            {
                'order': {
                    'current_state': 2,
                    'id_customer': 9499,
                    'id': '9603',
                    'total_shipping_tax_incl': '0.00',
                    'total_discounts_tax_incl': '0.00',
                    'associations': {
                        'order_rows': {
                            'order_row': {
                                'product_id': 9599,
                                'product_quantity': 1,
                                'product_reference': 'Fallback Item',
                            },
                        },
                    },
                },
            },
            {'customer': {'firstname': 'New', 'lastname': 'Buyer', 'email': 'newbuyer@example.com'}},
            {'product': {'name': {'language': [{'value': 'Auto Product'}]}}},
        ]
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            result = self.connector.action_import_orders()
        self.assertEqual(result['params']['type'], 'success')
        self.assertTrue(self.env['res.partner'].search([('prestashop', '=', 9499)], limit=1))
        self.assertTrue(self.env['product.product'].search([('prestashop', '=', 9599)], limit=1))

    def test_action_export_orders_branches(self):
        """Test exporting confirmed orders and inactive-country skips."""
        self.connector.state = 'connected'
        mock_service = MagicMock()
        self.env['sale.order'].search([('state', '=', 'sale')]).write({'prestashop': 9700})
        mock_service.search.return_value = [9700]
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            res_none = self.connector.action_export_orders()
        self.assertEqual(res_none['params']['type'], 'danger')

        partner = self.env['res.partner'].create({
            'name': 'Export Buyer',
            'email': 'export.buyer@example.com',
            'prestashop': 9402,
        })
        product = self.env['product.product'].create({
            'name': 'Export SO Product',
            'list_price': 100.0,
        })
        sale_order = self.env['sale.order'].create({
            'partner_id': partner.id,
            'order_line': [
                (0, 0, {'product_id': product.id, 'product_uom_qty': 2, 'price_unit': 100.0}),
            ],
        })
        sale_order.action_confirm()

        bad_partner = self.env['res.partner'].create({'name': 'Inactive Country Buyer', 'prestashop': 9403})
        bad_order = self.env['sale.order'].create({
            'partner_id': bad_partner.id,
            'order_line': [
                (0, 0, {'product_id': product.id, 'product_uom_qty': 1, 'price_unit': 50.0}),
            ],
        })
        bad_order.action_confirm()

        def fake_search(resource, flt):
            """Simulate PrestaShop order and address lookups."""
            if resource == 'orders' and flt.get('filter[id]') == 9700:
                return [9700]
            if resource == 'addresses' and flt.get('filter[id_customer]') == 9402:
                return [55]
            if resource == 'addresses' and flt.get('filter[id_customer]') == 9403:
                return [56]
            return []

        def fake_get(resource, rec_id):
            """Simulate PrestaShop address and country lookups."""
            if resource == 'addresses' and rec_id == 55:
                return {'address': {'id_country': 1}}
            if resource == 'addresses' and rec_id == 56:
                return {'address': {'id_country': 99}}
            if resource == 'countries' and rec_id == 1:
                return {'country': {'name': {'language': [{'value': 'USA'}]}, 'active': '1'}}
            if resource == 'countries' and rec_id == 99:
                return {'country': {'name': {'language': [{'value': 'TestLand'}]}, 'active': '0'}}
            return {}

        mock_service.search.side_effect = fake_search
        mock_service.get.side_effect = fake_get
        mock_service.add.side_effect = [
            {'prestashop': {'product': {'id': 9801}}},
            {'prestashop': {'cart': {'id': 9901}}},
            {'prestashop': {'order': {'id': 9902}}},
        ]
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            res_partial = self.connector.action_export_orders()
        self.assertEqual(res_partial['params']['type'], 'warning')
        self.assertEqual(sale_order.prestashop, 9902)
        self.assertFalse(bad_order.prestashop)

    def test_sync_actions_webservice_errors(self):
        """Test sync actions wrap PrestaShopWebServiceError as UserError."""
        self.connector.state = 'connected'
        product = self.env['product.product'].create({'name': 'Err Product'})
        partner = self.env['res.partner'].create({'name': 'Err Order Partner'})
        order = self.env['sale.order'].create({
            'partner_id': partner.id,
            'prestashop': 9720,
            'order_line': [(0, 0, {
                'product_id': product.id,
                'product_uom_qty': 1,
                'price_unit': 10.0,
            })],
        })
        order.action_confirm()

        mock_service = MagicMock()
        mock_service.search.side_effect = PrestaShopWebServiceError('Search err')
        mock_service.get.side_effect = PrestaShopWebServiceError('Get err')
        mock_service.add.side_effect = PrestaShopWebServiceError('Add err')

        for method_name in (
            'action_export_products',
            'action_import_contacts',
            'action_import_orders',
            'action_export_orders',
        ):
            with (
                patch(CLIENT_PATCH_PATH, return_value=mock_service),
                self.assertRaises(UserError),
            ):
                getattr(self.connector, method_name)()

    def test_get_stock_location_fallback_and_error(self):
        """Test warehouse fallback and missing stock location error."""
        location = self.connector._get_stock_location()
        self.assertTrue(location)

        with patch.object(type(self.env), 'ref', return_value=self.env['stock.location']):
            fallback_loc = self.connector._get_stock_location()
            self.assertTrue(fallback_loc)

            with (
                patch.object(
                    type(self.env['stock.warehouse']),
                    'search',
                    return_value=self.env['stock.warehouse'],
                ),
                self.assertRaises(UserError),
            ):
                self.connector._get_stock_location()

    def test_export_address_and_skipped_order_exports(self):
        """Test address country/state sync and all-skipped order exports."""
        self.connector.state = 'connected'
        country = self.env.ref('base.us')
        state = self.env['res.country.state'].search(
            [('country_id', '=', country.id)],
            limit=1,
        )
        if not state:
            state = self.env['res.country.state'].create({
                'name': 'Test State',
                'code': 'TS',
                'country_id': country.id,
            })
        partner = self.env['res.partner'].create({
            'name': 'Geo Partner',
            'street': '123 Main St',
            'city': 'Austin',
            'country_id': country.id,
            'state_id': state.id,
            'prestashop': 9410,
        })
        mock_service = MagicMock()
        mock_service.search.side_effect = [[21], [5]]
        self.connector._export_partner_address(
            mock_service,
            partner,
            'Geo',
            'Partner',
            street_fallback=True,
        )
        addr_call = mock_service.add.call_args[0][1]['address']
        self.assertEqual(addr_call['address1'], '123 Main St')
        self.assertEqual(addr_call['id_country'], 21)
        self.assertEqual(addr_call['id_state'], 5)

        self.env['sale.order'].search([('state', '=', 'sale')]).write({'prestashop': 9710})
        no_cust_partner = self.env['res.partner'].create({'name': 'No Cust'})
        no_addr_partner = self.env['res.partner'].create({
            'name': 'No Addr',
            'prestashop': 9411,
        })
        no_prod_partner = self.env['res.partner'].create({
            'name': 'No Prod',
            'prestashop': 9412,
        })
        unexported_prod = self.env['product.product'].create({'name': 'Blocked Prod'})
        for order_partner in (no_cust_partner, no_addr_partner, no_prod_partner):
            order = self.env['sale.order'].create({
                'partner_id': order_partner.id,
                'order_line': [(0, 0, {
                    'product_id': unexported_prod.id,
                    'product_uom_qty': 1,
                    'price_unit': 25.0,
                })],
            })
            order.action_confirm()

        def skip_search(resource, flt):
            """Simulate lookups causing each order export to skip."""
            if resource == 'orders' and flt.get('filter[id]') == 9710:
                return [9710]
            if resource == 'addresses' and flt.get('filter[id_customer]') == 9412:
                return [77]
            return []

        mock_service.search.side_effect = skip_search
        mock_service.get.side_effect = PrestaShopWebServiceError('Country err')
        mock_service.add.side_effect = PrestaShopWebServiceError('Add blocked')
        with patch(CLIENT_PATCH_PATH, return_value=mock_service):
            res_skipped = self.connector.action_export_orders()
        self.assertEqual(res_skipped['params']['type'], 'danger')
        self.assertEqual(res_skipped['params']['title'], 'Order Export Skipped')
