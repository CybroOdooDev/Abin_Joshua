# -*- coding: utf-8 -*-

from odoo import models, fields


class KitchenDisplay(models.Model):
    _name = "kitchen.display"
    _description = "Kitchen Display"

    name = fields.Char(required=True)
    pos_ids = fields.Many2many(
        "pos.config",
        string="Point of Sale",
        required=True
    )
    stage_ids = fields.One2many(
        "kitchen.display.stage",
        "display_id",
        string="Stages"
    )
    in_progress_count = fields.Integer(
        string="In Progress",
        compute="_compute_kitchen_stats",
    )
    avg_waiting_minutes = fields.Integer(
        string="Avg Wait (min)",
        compute="_compute_kitchen_stats",
    )
    product_pos_categ_ids = fields.Many2many(
        "pos.category",
        string="Product Families",
        help="Families of products to be displayed in the kitchen display"
    )


    def _compute_kitchen_stats(self):
        for display in self:
            stages = display.stage_ids.sorted("sequence")
            if not stages:
                display.in_progress_count = 0
                display.avg_waiting_minutes = 0
                continue
            last_stage_id = stages[-1].id

            domain = [
                ("order_id.display_id", "=", display.id),
                ("stage_id", "!=", last_stage_id),
                ("start_time", "!=", False),
            ]
            if display.product_pos_categ_ids:
                domain += [
                    "|",
                    ("product_id.pos_categ_ids", "=", False),
                    ("product_id.pos_categ_ids", "in", display.product_pos_categ_ids.ids),
                ]

            # use read_group for a single aggregate SQL query instead of
            # fetching every line record into Python just to call len() and sum().
            groups = self.env["kitchen.order.line"].read_group(
                domain=domain,
                fields=["id:count", "start_time:min"],
                groupby=[],
            )
            count = groups[0]["id"] if groups else 0
            display.in_progress_count = count
            if count and groups[0].get("start_time"):
                now = fields.Datetime.now()
                #  original used .seconds (wraps at 86399s) — orders waiting
                # over 24 h would silently show 0 minutes. Use total_seconds().
                oldest = fields.Datetime.from_string(groups[0]["start_time"])
                elapsed_minutes = int((now - oldest).total_seconds() // 60)
                display.avg_waiting_minutes = max(0, elapsed_minutes)
            else:
                display.avg_waiting_minutes = 0

    def open_display(self):
        return {
            "type": "ir.actions.act_url",
            "url": "/kitchen/display/%s" % self.id,
            "target": "self",
        }
