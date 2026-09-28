# -*- coding: utf-8 -*-

from odoo import models


class PosSession(models.Model):
    _inherit = "pos.session"

    def _pos_ui_models_to_load(self):
        result = super()._pos_ui_models_to_load()
        if "pos.plating.level" not in result:
            result.append("pos.plating.level")
        return result

    def _loader_params_pos_plating_level(self):
        return {
            "search_params": {
                "domain": [],
                "fields": ["name", "sequence", "color", "is_default"],
            },
        }

    def _get_pos_ui_pos_plating_level(self, params):
        return self.env["pos.plating.level"].search_read(**params["search_params"])
