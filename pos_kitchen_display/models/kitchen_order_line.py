# -*- coding: utf-8 -*-
import logging
from odoo import _, api, models, fields

_logger = logging.getLogger(__name__)


class KitchenOrderLine(models.Model):
    _name = "kitchen.order.line"
    _description = "Kitchen Order Line"

    order_id = fields.Many2one("kitchen.order")
    product_name = fields.Char(string="Product Name")
    product_id = fields.Many2one("product.product", string="Product")
    qty = fields.Float(string="Quantity")
    tracking_number = fields.Char(string="Tracking Number")
    note = fields.Char(string="Note")
    is_cancelled = fields.Boolean(default=False, index=True)
    is_free = fields.Boolean(string="Free Product", default=False)
    stage_id = fields.Many2one("kitchen.display.stage", string="Stage", index=True)
    start_time = fields.Datetime(default=fields.Datetime.now)
    user_id = fields.Many2one("res.users", string="Waiter")
    combo_name = fields.Char(string="Combo Name")
    pos_line_uuid = fields.Char(index=True)
    combo_instance_uuid = fields.Char(index=True)
    pos_order_line_id = fields.Many2one(
        "pos.order.line",
        string="POS Order Line",
        index=True
    )
    is_reminder = fields.Boolean(default=False)
    reminder_count = fields.Integer(default=0)
    free_qty = fields.Float(default=0, help="Free Quantity")
    paid_qty = fields.Float(default=0, help="Paid Quantity")
    is_completed = fields.Boolean(default=False, index=True)

    def _is_last_stage(self):
        self.ensure_one()
        stages = self.order_id.display_id.stage_ids.sorted("sequence")
        if not stages:
            return False
        return self.stage_id.id == stages[-1].id

    def _check_and_notify(self):
        self.ensure_one()
        order = self.order_id
        if not order:
            return
        stages = order.display_id.stage_ids.sorted("sequence")
        if not stages:
            return
        last_stage_id = stages[-1].id

        all_done = all(
            line.stage_id.id == last_stage_id
            for line in order.line_ids
        )

        if all_done:
            for pos in order.display_id.pos_ids:
                channel = f"pos_config_{pos.id}"
                table = order.pos_order_id.table_id
                self.env["bus.bus"]._sendone(
                    channel,
                    "kitchen_order_ready",
                    {
                        "order_name": order.name,
                        "table_name": order.table_name or "",
                        "tracking_number": self.tracking_number or "",
                        "table_id": table.id if table else None,
                        "floor_id": table.floor_id.id if table and table.floor_id else None,
                    }
                )
            if order.user_id:
                self._send_chat_to_waiter(order)

    def action_accept_order(self, order_id):
        order = self.env["kitchen.order"].browse(order_id)
        if not order:
            return
        display = order.display_id
        lines = order.line_ids
        if display and display.product_pos_categ_ids:
            allowed_cat_ids = set(display.product_pos_categ_ids.ids)
            lines = lines.filtered(
                lambda l: not l.product_id.pos_categ_ids or any(
                    cat_id in allowed_cat_ids
                    for cat_id in l.product_id.pos_categ_ids.ids
                )
            )
        for line in lines:
            if line.exists():
                line.action_next_stage()

    def _send_chat_to_waiter(self, order):
        waiter = order.user_id
        bot = self.env.ref("base.user_root")

        get_or_create = getattr(
            self.env["discuss.channel"].with_user(bot),
            "_get_or_create_direct_channel",
            None,
        )
        if callable(get_or_create):
            channel = get_or_create(waiter.partner_id.id)
        else:
            channel = self.env["discuss.channel"].with_user(bot).search([
                ("channel_type", "=", "chat"),
                ("channel_member_ids.partner_id", "=", waiter.partner_id.id),
                ("channel_member_ids.partner_id", "=", bot.partner_id.id),
            ], limit=1)
            if not channel:
                channel = self.env["discuss.channel"].with_user(bot).create({
                    "name": waiter.name,
                    "channel_type": "chat",
                    "channel_member_ids": [
                        (0, 0, {"partner_id": bot.partner_id.id}),
                        (0, 0, {"partner_id": waiter.partner_id.id}),
                    ],
                })

        message = _("🍽️ Order %s is ready!") % order.name
        if order.table_name:
            message += _(" 🪑 Table: %s") % order.table_name

        channel.with_user(bot).message_post(
            body=message,
            message_type="comment",
            subtype_xmlid="mail.mt_comment",
        )

    def _notify_kds(self):
        for line in self:
            if not line.order_id.display_id:
                continue
            self.env["bus.bus"]._sendone(
                f"kitchen_display_{line.order_id.display_id.id}",
                "update",
                {"order_id": line.order_id.id}
            )

    def action_next_stage(self):
        stages_cache = {}
        for line in self:
            if not line.exists():
                continue
            display_id = line.order_id.display_id.id
            if display_id not in stages_cache:
                stages_cache[display_id] = line.order_id.display_id.stage_ids.sorted(
                    "sequence")
            stages = stages_cache[display_id]
            ids = stages.ids
            if line.stage_id.id not in ids:
                continue
            index = ids.index(line.stage_id.id)
            if index < len(stages) - 1:
                line.write({"stage_id": stages[index + 1].id,
                            "start_time": fields.Datetime.now()})
                if not line.exists():  # was merged and unlinked, stop here
                    continue
                line._notify_kds()
                if line._is_last_stage():
                    line._check_and_notify()

    def action_previous_stage(self):
        stages_cache = {}
        for line in self:
            if not line.exists():
                continue
            display_id = line.order_id.display_id.id
            if display_id not in stages_cache:
                stages_cache[display_id] = line.order_id.display_id.stage_ids.sorted(
                    "sequence")
            stages = stages_cache[display_id]
            ids = stages.ids
            if line.stage_id.id not in ids:
                continue
            index = ids.index(line.stage_id.id)
            if index > 0:
                line.write({"stage_id": stages[index - 1].id,
                            "start_time": fields.Datetime.now()})
                if not line.exists():
                    continue
                line._notify_kds()

    def action_finish(self):
        orders = self.mapped("order_id")
        self.write({
            "is_completed": True,
        })
        for order in orders:
            self.env["bus.bus"]._sendone(
                f"kitchen_display_{order.display_id.id}",
                "update",
                {"order_id": order.id}
            )

    @api.model
    def action_finish_all(self, display_id):
        display = self.env["kitchen.display"].browse(display_id)
        if not display.exists():
            return
        stages = display.stage_ids.sorted("sequence")
        if not stages:
            return
        last_stage = stages[-1]
        domain = [
            ("order_id.display_id", "=", display.id),
            ("stage_id", "=", last_stage.id),
        ]
        if display.product_pos_categ_ids:
            domain += [
                "|",
                ("product_id.pos_categ_ids", "=", False),
                ("product_id.pos_categ_ids", "in", display.product_pos_categ_ids.ids),
            ]
        lines = self.search(domain)
        orders = lines.mapped("order_id")
        for line in lines:
            line.write({
                "is_completed": True,
            })
        for order in orders:
            self.env["bus.bus"]._sendone(
                f"kitchen_display_{display.id}",
                "update",
                {"order_id": order.id}
            )
