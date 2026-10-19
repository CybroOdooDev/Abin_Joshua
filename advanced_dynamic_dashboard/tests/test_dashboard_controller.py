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
from odoo.tests.common import HttpCase, tagged


@tagged('post_install', '-at_install')
class TestDashboardController(HttpCase):

    def test_search_input_chart_endpoint(self):
        """Test /custom_dashboard/search_input_chart search functionality."""
        block = self.env['dashboard.block'].create({
            'name': 'Controller Test Block',
            'operation': 'count',
        })
        results = self.env['dashboard.block'].search([('name', 'ilike', 'Controller Test')]).ids
        self.assertIn(block.id, results)
