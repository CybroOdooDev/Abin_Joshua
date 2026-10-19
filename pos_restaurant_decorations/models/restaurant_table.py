# -*- coding: utf-8 -*-
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
