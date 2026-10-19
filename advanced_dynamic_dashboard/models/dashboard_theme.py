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
from odoo import api, fields, models


class DashboardTheme(models.Model):
    """Class to create new dashboard theme"""
    _name = 'dashboard.theme'
    _description = 'Dashboard Theme'

    name = fields.Char(string='Theme Name', help='Name of the theme')
    color_x = fields.Char(help='Select the color_x for theme',
                          default='#4158D0')
    color_y = fields.Char(help='Select the color_y for theme',
                          default='#C850C0')
    color_z = fields.Char(help='Select the color_z for theme',
                          default='#FFCC70')
    body = fields.Html(compute='_compute_theme_style',
                       store=True, help='Preview of the theme will be shown')
    style = fields.Char(compute='_compute_theme_style',
                        store=True, help='It store the style of the gradient')

    @api.depends('color_x', 'color_y', 'color_z')
    def _compute_theme_style(self):
        """Compute preview body and gradient style for the theme"""
        for rec in self:
            color_x = rec.color_x or '#4158D0'
            color_y = rec.color_y or '#C850C0'
            color_z = rec.color_z or '#FFCC70'
            rec.body = f"<div style='width:300px; height:300px;background-image: linear-gradient(50deg, {color_x} 0%, {color_y} 46%, {color_z} 100%);'/>"
            rec.style = f"background-image: linear-gradient(50deg, {color_x} 0%, {color_y} 46%, {color_z} 100%);"

    def get_records(self):
        """
            Function for returning all records with fields name and style
        """
        records = self.search_read([], ['name', 'style'], limit=80)
        return records
