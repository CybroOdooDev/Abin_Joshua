# -*- coding: utf-8 -*-
from odoo import fields, models


class RestaurantDecorImage(models.Model):
    _name = 'restaurant.decor.image'
    _description = 'Saved Floor Decor & Custom Table Image'
    _order = 'create_date desc'

    name = fields.Char(string='Name', required=True)
    image = fields.Binary(string='Image Graphic', attachment=True, required=True)
    table_type = fields.Selection([
        ('table', 'Table'),
        ('chair', 'Chair'),
        ('bar', 'Bar Item'),
        ('flowerpot', 'Flowerpot & Plant'),
        ('barrel', 'Barrel'),
        ('decoration', 'Decoration'),
    ], string='Item Type', default='decoration')
    is_decoration = fields.Boolean(
        string='Is Decoration (Scenery)',
        default=True,
        help='If checked, this item acts as visual floor scenery and will not trigger diner counts or orders.'
    )
    seats = fields.Integer(string='Customer Seats', default=0)
    active = fields.Boolean(default=True)

