# -*- coding: utf-8 -*-

from odoo import models, fields

class KitchenOrder(models.Model):
    _name = "kitchen.order"
    _description = "Kitchen Order"

    name = fields.Char(required=True)
    display_id = fields.Many2one("kitchen.display")
    stage_id = fields.Many2one(
        "kitchen.display.stage",
        string="Stage"
    )
    pos_order_id = fields.Many2one(
        "pos.order",
        string="POS Order",
        ondelete="cascade",
        index=True
    )
    tracking_number = fields.Char(
        string="Tracking Number",
    )
    table_name = fields.Char()
    order_time = fields.Datetime(default=fields.Datetime.now)
    user_id = fields.Many2one(
        "res.users",
        string="Waiter"
    )
    stage_start_time = fields.Datetime(
        string="Stage Start Time",
        default=fields.Datetime.now
    )
    order_type = fields.Selection([
        ("dine_in", "Dine In"),
        ("takeaway", "Takeaway"),
    ], string="Order Type")
    line_ids = fields.One2many(
        "kitchen.order.line",
        "order_id")

    def send_category_reminder(self, pos_order_id, category_ids):
        # Search ALL kitchen orders for this pos_order, not just one
        kitchen_orders = self.search([
            ("pos_order_id", "=", pos_order_id)
        ])
        if not kitchen_orders:
            return

        for order in kitchen_orders:
            lines = order.line_ids.filtered(
                lambda l:
                (
                    # normal category match
                        l.product_id.pos_categ_ids.ids and any(
                    c in l.product_id.pos_categ_ids.ids for c in category_ids if
                    isinstance(c, int)
                )
                )
                or (
                        "others" in category_ids and not l.product_id.pos_categ_ids
                )
            )
            if order.display_id.product_pos_categ_ids:
                allowed_cat_ids = set(order.display_id.product_pos_categ_ids.ids)
                lines = lines.filtered(
                    lambda l: not l.product_id.pos_categ_ids or any(
                        cat_id in allowed_cat_ids
                        for cat_id in l.product_id.pos_categ_ids.ids
                    )
                )
            if not lines:
                continue
            for line in lines:
                line.reminder_count += 1
                line.is_reminder = True
            real_ids = [c for c in category_ids if isinstance(c, int)]
            categories = self.env["pos.category"].browse(real_ids).mapped("name")
            if "others" in category_ids:
                categories.append("Others")
            self.env["bus.bus"]._sendone(
                f"kitchen_display_{order.display_id.id}",
                "category_reminder",
                {
                    "order_id": order.id,
                    "order_name": order.name,
                    "display_id": order.display_id.id,
                    "category": ", ".join(categories),
                    "line_ids": lines.ids,
                }
            )
