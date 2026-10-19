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
class TestDashboardMenu(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.parent_menu = cls.env['ir.ui.menu'].create({
            'name': 'Test Parent Menu',
        })

    def test_create_dashboard_menu_with_dict(self):
        """Test creating dashboard menu passing a single dictionary to create()."""
        menu_rec = self.env['dashboard.menu'].create({
            'name': 'Sales Analytics',
            'menu_id': self.parent_menu.id,
        })
        self.assertTrue(menu_rec)
        self.assertEqual(menu_rec.name, 'Sales Analytics')
        self.assertTrue(menu_rec.client_action_id)
        self.assertEqual(menu_rec.client_action_id.tag, 'AdvancedDynamicDashboard')
        self.assertEqual(menu_rec.client_action_id.name, 'Sales Analytics')
        self.assertTrue(menu_rec.child_menu_id)
        self.assertEqual(menu_rec.child_menu_id.name, 'Sales Analytics')
        self.assertEqual(menu_rec.child_menu_id.parent_id, self.parent_menu)
        self.assertEqual(menu_rec.child_menu_id.action._name, 'ir.actions.client')
        self.assertEqual(menu_rec.child_menu_id.action.id, menu_rec.client_action_id.id)

    def test_create_dashboard_menu_with_list(self):
        """Test creating dashboard menus in batch passing a list of dicts."""
        menus = self.env['dashboard.menu'].create([
            {'name': 'Dashboard Alpha', 'menu_id': self.parent_menu.id},
            {'name': 'Dashboard Beta', 'menu_id': self.parent_menu.id},
        ])
        self.assertEqual(len(menus), 2)
        for m in menus:
            self.assertTrue(m.client_action_id)
            self.assertEqual(m.client_action_id.tag, 'AdvancedDynamicDashboard')
            self.assertTrue(m.child_menu_id)

    def test_write_dashboard_menu(self):
        """Test updating dashboard menu name and parent menu."""
        menu_rec = self.env['dashboard.menu'].create({
            'name': 'Initial Name',
            'menu_id': self.parent_menu.id,
        })
        new_parent = self.env['ir.ui.menu'].create({'name': 'New Parent Menu'})
        menu_rec.write({
            'name': 'Updated Name',
            'menu_id': new_parent.id,
        })
        self.assertEqual(menu_rec.name, 'Updated Name')
        self.assertEqual(menu_rec.client_action_id.name, 'Updated Name')
        self.assertEqual(menu_rec.child_menu_id.name, 'Updated Name')
        self.assertEqual(menu_rec.child_menu_id.parent_id, new_parent)

    def test_unlink_dashboard_menu(self):
        """Test unlinking dashboard menu also removes created menu and action."""
        menu_rec = self.env['dashboard.menu'].create({
            'name': 'To Be Deleted',
            'menu_id': self.parent_menu.id,
        })
        action = menu_rec.client_action_id
        child_menu = menu_rec.child_menu_id
        self.assertTrue(action.exists())
        self.assertTrue(child_menu.exists())

        menu_rec.unlink()
        self.assertFalse(action.exists())
        self.assertFalse(child_menu.exists())

    def test_menu_group_ids_related(self):
        """Test related group_ids field from parent menu."""
        test_group = self.env.ref('base.group_user')
        self.parent_menu.write({'group_ids': [(4, test_group.id)]})
        menu_rec = self.env['dashboard.menu'].create({
            'name': 'Protected Dashboard',
            'menu_id': self.parent_menu.id,
        })
        self.assertIn(test_group, menu_rec.group_ids)
