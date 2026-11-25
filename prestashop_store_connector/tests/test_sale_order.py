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
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestSaleOrder(TransactionCase):
    """Test cases for the SaleOrder PrestaShop extension."""

    @classmethod
    def setUpClass(cls):
        """Set up a sales order record linked to a PrestaShop ID."""
        super().setUpClass()
        cls.partner = cls.env['res.partner'].create({
            'name': 'Test SO Partner',
        })
        cls.sale_order = cls.env['sale.order'].create({
            'partner_id': cls.partner.id,
            'prestashop': 67890,
        })

    def test_copy_resets_prestashop(self):
        """Test that copying a sale order resets the prestashop ID."""
        copied_order = self.sale_order.copy()
        self.assertFalse(copied_order.prestashop)
