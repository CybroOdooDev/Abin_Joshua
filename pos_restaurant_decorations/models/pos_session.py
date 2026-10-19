# -*- coding: utf-8 -*-
from odoo import models


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _loader_params_restaurant_table(self):
        params = super()._loader_params_restaurant_table()
        params['search_params']['fields'].extend([
            'table_type',
            'is_decoration',
            'decor_preset_id',
            'image_url',
            'custom_image',
            'show_label',
            'show_seats',
        ])
        return params
