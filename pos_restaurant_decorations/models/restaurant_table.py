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
from odoo import fields, models


class RestaurantTable(models.Model):
    _inherit = 'restaurant.table'

    table_type = fields.Selection([
        ('table', 'Table'),
        ('chair', 'Chair'),
        ('bar', 'Bar Item'),
        ('flowerpot', 'Flowerpot & Plant'),
        ('barrel', 'Barrel'),
        ('decoration', 'Decoration'),
    ], string='Item Type', default='table')
    is_decoration = fields.Boolean(
        string='Is Decoration (Scenery)',
        default=False,
        help='If checked, this item acts as visual floor scenery and will not trigger diner counts or orders.'
    )
    decor_preset_id = fields.Char(string='Decor Preset Identifier')
    image_url = fields.Char(string='Image URL')
    custom_image = fields.Binary(string='Custom Image', attachment=True)
    show_label = fields.Boolean(string='Show Table Name / Label', default=True)
    show_seats = fields.Boolean(string='Show Seats Count', default=True)
    rotation = fields.Integer(string='Rotation (Degrees)', default=0)
    z_index = fields.Integer(string='Layer (Z-Index)', default=10)
