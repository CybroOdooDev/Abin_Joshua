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
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestProductRestrictionUsers(TransactionCase):
    """Test suite verifying product and category restrictions on users."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.group_user = cls.env.ref('base.group_user')
        cls.group_erp_manager = cls.env.ref('base.group_erp_manager')

        cls.restricted_user = cls.env['res.users'].create({
            'name': 'Test Restricted User',
            'login': 'restricted_user@example.com',
            'email': 'restricted_user@example.com',
            'group_ids': [(6, 0, [cls.group_user.id])],
        })

        cls.admin_user = cls.env['res.users'].create({
            'name': 'Test Admin User',
            'login': 'admin_user@example.com',
            'email': 'admin_user@example.com',
            'group_ids': [(6, 0, [cls.group_user.id, cls.group_erp_manager.id])],
        })

        cls.parent_category = cls.env['product.category'].create({
            'name': 'Electronics',
        })
        cls.child_category = cls.env['product.category'].create({
            'name': 'Smartphones',
            'parent_id': cls.parent_category.id,
        })
        cls.other_category = cls.env['product.category'].create({
            'name': 'Furniture',
        })

        cls.product_laptop = cls.env['product.template'].create({
            'name': 'Laptop',
            'categ_id': cls.parent_category.id,
        })
        cls.product_phone = cls.env['product.template'].create({
            'name': 'Phone',
            'categ_id': cls.child_category.id,
        })
        cls.product_chair = cls.env['product.template'].create({
            'name': 'Office Chair',
            'categ_id': cls.other_category.id,
        })

    def test_compute_is_admin(self):
        """Verify _compute_is_admin logic for standard users and managers."""
        self.assertFalse(self.restricted_user.is_admin)
        self.assertTrue(self.admin_user.is_admin)

    def test_unrestricted_product_visible_to_all(self):
        """Verify products with no restrict_user_ids are visible to all users."""
        products = self.env['product.template'].with_user(self.restricted_user).search([
            ('id', 'in', [self.product_laptop.id, self.product_phone.id,
                          self.product_chair.id]),
        ])
        self.assertEqual(len(products), 3,
                         "Products with empty restrict_user_ids must be visible to all users")

    def test_product_restriction_by_restrict_user_ids(self):
        """Verify user can only see products where they appear in restrict_user_ids."""
        self.product_laptop.write({
            'restrict_user_ids': [(6, 0, [self.restricted_user.id])],
        })
        self.product_phone.write({
            'restrict_user_ids': [(6, 0, [self.restricted_user.id])],
        })
        # product_chair has no restrict_user_ids -> visible to all
        products = self.env['product.template'].with_user(self.restricted_user).search([
            ('id', 'in', [self.product_laptop.id, self.product_phone.id,
                          self.product_chair.id]),
        ])
        self.assertIn(self.product_laptop, products)
        self.assertIn(self.product_phone, products)
        self.assertIn(self.product_chair, products)

        # Now restrict product_chair to another user - restricted_user cannot see it
        other_user = self.env['res.users'].create({
            'name': 'Other User',
            'login': 'other@example.com',
            'email': 'other@example.com',
            'group_ids': [(6, 0, [self.group_user.id])],
        })
        self.product_chair.write({
            'restrict_user_ids': [(6, 0, [other_user.id])],
        })
        products_after = self.env['product.template'].with_user(
            self.restricted_user).search([
                ('id', 'in', [self.product_laptop.id, self.product_phone.id,
                              self.product_chair.id]),
            ])
        self.assertIn(self.product_laptop, products_after)
        self.assertIn(self.product_phone, products_after)
        self.assertNotIn(self.product_chair, products_after)

    def test_admin_user_bypass(self):
        """Verify ERP managers bypass all product restrictions via permission row in ir.access."""
        self.product_laptop.write({
            'restrict_user_ids': [(6, 0, [self.restricted_user.id])],
        })
        # admin_user is NOT in restrict_user_ids, but as ERP manager sees everything
        products = self.env['product.template'].with_user(self.admin_user).search([
            ('id', 'in', [self.product_laptop.id, self.product_phone.id,
                          self.product_chair.id]),
        ])
        self.assertEqual(len(products), 3,
                         "ERP managers must see all products regardless of restrict_user_ids")

    def test_restrict_user_ids_field(self):
        """Verify restrict_user_ids Many2many field on product.template works correctly."""
        self.product_laptop.write({
            'restrict_user_ids': [(6, 0, [self.restricted_user.id])],
        })
        self.assertIn(self.restricted_user, self.product_laptop.restrict_user_ids)
        self.assertIn(self.product_laptop, self.restricted_user.allowed_product_ids)

    def test_allowed_product_ids_field(self):
        """Verify allowed_product_ids on res.users reflects restrict_user_ids on products."""
        self.product_phone.write({
            'restrict_user_ids': [(6, 0, [self.restricted_user.id])],
        })
        self.assertIn(self.product_phone, self.restricted_user.allowed_product_ids)

    def test_allowed_product_category_ids_field(self):
        """Verify allowed_product_category_ids can be set on users."""
        self.restricted_user.write({
            'restricted_type': 'category',
            'allowed_product_category_ids': [(6, 0, [self.parent_category.id])],
        })
        self.assertIn(self.parent_category,
                      self.restricted_user.allowed_product_category_ids)

    def test_restricted_type_field(self):
        """Verify restricted_type selection field on res.users works correctly."""
        self.restricted_user.write({'restricted_type': 'product'})
        self.assertEqual(self.restricted_user.restricted_type, 'product')
        self.restricted_user.write({'restricted_type': 'category'})
        self.assertEqual(self.restricted_user.restricted_type, 'category')

    def test_is_product_is_category_fields(self):
        """Verify is_product and is_category boolean fields on product.template."""
        self.assertTrue(self.product_laptop.is_product)
        self.assertTrue(self.product_laptop.is_category)
        self.product_laptop.write({'is_product': False, 'is_category': False})
        self.assertFalse(self.product_laptop.is_product)
        self.assertFalse(self.product_laptop.is_category)
