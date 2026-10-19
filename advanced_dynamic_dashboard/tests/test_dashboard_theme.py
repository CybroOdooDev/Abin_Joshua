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
class TestDashboardTheme(TransactionCase):

    def test_theme_gradient_computation(self):
        """Test computed gradient style and HTML body of dashboard.theme."""
        theme = self.env['dashboard.theme'].create({
            'name': 'Sunset Glow',
            'color_x': '#ff7e5f',
            'color_y': '#feb47b',
            'color_z': '#ffeccc',
        })
        self.assertIn('#ff7e5f', theme.style)
        self.assertIn('#feb47b', theme.style)
        self.assertIn('#ffeccc', theme.style)
        self.assertIn('linear-gradient', theme.style)
        self.assertIn(theme.style, theme.body)

    def test_theme_get_records(self):
        """Test get_records returns themes with name and style."""
        self.env['dashboard.theme'].create({
            'name': 'Ocean Blue',
            'color_x': '#2b5876',
            'color_y': '#4e4376',
            'color_z': '#6a82fb',
        })
        records = self.env['dashboard.theme'].get_records()
        self.assertTrue(len(records) > 0)
        names = [r['name'] for r in records]
        self.assertIn('Ocean Blue', names)
        for r in records:
            self.assertIn('name', r)
            self.assertIn('style', r)
