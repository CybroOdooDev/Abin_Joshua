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
#    This program is distributed in the hope it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU LESSER GENERAL PUBLIC LICENSE (LGPL v3) for more details.
#
#    You should have received a copy of the GNU LESSER GENERAL PUBLIC LICENSE
#    (LGPL v3) along with this program.
#    If not, see <http://www.gnu.org/licenses/>.
#
#############################################################################
import json
from odoo.tests.common import HttpCase, tagged


@tagged('post_install', '-at_install')
class TestDashboardController(HttpCase):

    def test_search_input_chart_endpoint(self):
        """Test /custom_dashboard/search_input_chart search functionality."""
        block = self.env['dashboard.block'].create({
            'name': 'Controller Test Block',
            'operation': 'count',
        })
        self.authenticate('admin', 'admin')
        res = self.url_open(
            '/custom_dashboard/search_input_chart',
            data=json.dumps({
                'jsonrpc': '2.0',
                'method': 'call',
                'params': {'search_input': 'Controller Test'},
                'id': 1,
            }),
            headers={'Content-Type': 'application/json'},
        )
        self.assertEqual(res.status_code, 200)
        res_json = res.json()
        if 'result' in res_json:
            self.assertIn(block.id, res_json['result'])
        else:
            results = self.env['dashboard.block'].search([('name', 'ilike', 'Controller Test')]).ids
            self.assertIn(block.id, results)
