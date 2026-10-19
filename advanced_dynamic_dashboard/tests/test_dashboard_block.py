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
#############################################################################
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestDashboardBlock(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.res_partner_model = cls.env['ir.model'].search([('model', '=', 'res.partner')], limit=1)
        cls.client_action = cls.env['ir.actions.client'].create({
            'name': 'Test Dashboard Action',
            'tag': 'AdvancedDynamicDashboard',
        })

    def test_create_tile_block(self):
        """Test creating a tile block and retrieving values."""
        block = self.env['dashboard.block'].create({
            'name': 'Total Contacts',
            'type': 'tile',
            'model_id': self.res_partner_model.id,
            'operation': 'count',
            'client_action_id': self.client_action.id,
            'fa_icon': 'fa-users',
            'tile_color': '#1abc9c',
        })
        self.assertEqual(block.name, 'Total Contacts')
        self.assertEqual(block.type, 'tile')
        self.assertEqual(block.model_name, 'res.partner')

        vals = self.env['dashboard.block'].get_dashboard_vals(self.client_action.id)
        self.assertTrue(any(v['id'] == block.id for v in vals))
        tile_data = next(v for v in vals if v['id'] == block.id)
        self.assertEqual(tile_data['type'], 'tile')
        self.assertEqual(tile_data['name'], 'Total Contacts')

    def test_create_graph_block(self):
        """Test creating a graph block and retrieving values."""
        block = self.env['dashboard.block'].create({
            'name': 'Contacts by Country',
            'type': 'graph',
            'graph_type': 'bar',
            'model_id': self.res_partner_model.id,
            'operation': 'count',
            'client_action_id': self.client_action.id,
        })
        self.assertEqual(block.name, 'Contacts by Country')
        self.assertEqual(block.type, 'graph')
        self.assertEqual(block.graph_type, 'bar')

        vals = self.env['dashboard.block'].get_dashboard_vals(self.client_action.id)
        graph_data = next((v for v in vals if v['id'] == block.id), None)
        self.assertIsNotNone(graph_data)
        self.assertEqual(graph_data['type'], 'graph')
        self.assertIn('x_axis', graph_data)
        self.assertIn('y_axis', graph_data)

    def test_default_action(self):
        """Test get_default_action method."""
        default_act_id = self.env['dashboard.block'].get_default_action()
        ref_action = self.env.ref('advanced_dynamic_dashboard.dashboard_view_action', raise_if_not_found=False)
        expected_id = ref_action.id if ref_action else False
        self.assertEqual(default_act_id, expected_id)

    def test_onchange_model_id(self):
        """Test onchange model_id resets operation and measured_field_id."""
        block = self.env['dashboard.block'].create({
            'name': 'Test Onchange',
            'model_id': self.res_partner_model.id,
            'operation': 'count',
            'client_action_id': self.client_action.id,
        })
        block._onchange_model_id()
        self.assertFalse(block.operation)
        self.assertFalse(block.measured_field_id)

    def test_get_save_layout(self):
        """Test get_save_layout updates position and size attributes."""
        block = self.env['dashboard.block'].create({
            'name': 'Layout Block',
            'operation': 'count',
            'client_action_id': self.client_action.id,
        })
        grid_data = [{
            'id': str(block.id),
            'data-x': '150',
            'data-y': '250',
            'height': '300',
            'width': '400',
        }]
        result = self.env['dashboard.block'].get_save_layout(grid_data)
        self.assertTrue(result)
        self.assertEqual(block.data_x, '150')
        self.assertEqual(block.data_y, '250')
        self.assertEqual(block.translate_x, '150px')
        self.assertEqual(block.translate_y, '250px')
        self.assertEqual(block.height, '300px')
        self.assertEqual(block.width, '400px')

    def test_dashboard_vals_with_date_filter(self):
        """Test get_dashboard_vals with date filtering."""
        block = self.env['dashboard.block'].create({
            'name': 'Date Filtered Block',
            'type': 'tile',
            'model_id': self.res_partner_model.id,
            'operation': 'count',
            'client_action_id': self.client_action.id,
        })
        vals = self.env['dashboard.block'].get_dashboard_vals(
            self.client_action.id, start_date='2020-01-01', end_date='2030-12-31'
        )
        self.assertTrue(any(v['id'] == block.id for v in vals))

    def test_graph_block_with_groupby(self):
        """Test graph block with group_by field."""
        parent_field = self.env['ir.model.fields'].search([
            ('model_id', '=', self.res_partner_model.id),
            ('name', '=', 'parent_id'),
        ], limit=1)
        block = self.env['dashboard.block'].create({
            'name': 'Contacts Grouped',
            'type': 'graph',
            'graph_type': 'pie',
            'model_id': self.res_partner_model.id,
            'operation': 'count',
            'group_by_id': parent_field.id if parent_field else False,
            'client_action_id': self.client_action.id,
        })
        vals = self.env['dashboard.block'].get_dashboard_vals(self.client_action.id)
        graph_data = next((v for v in vals if v['id'] == block.id), None)
        self.assertIsNotNone(graph_data)
        self.assertIn('x_axis', graph_data)
        self.assertIn('y_axis', graph_data)
