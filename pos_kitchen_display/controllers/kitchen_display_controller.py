# -*- coding: utf-8 -*-
from odoo import fields, http
from odoo.http import request


class KitchenController(http.Controller):

    @http.route('/kitchen/display/<int:display_id>', auth='user', website=True)
    def kitchen_display(self, display_id, **kwargs):
        display = request.env["kitchen.display"].sudo().browse(display_id)
        if not display.exists():
            return request.not_found()

        session_info = request.env["ir.http"].get_frontend_session_info()
        session_info["kitchen_display"] = {
            "id": display.id,
            "name": display.name,
        }

        return request.render(
            "pos_kitchen_display.kitchen_display_index",
            {
                "session_info": session_info,
                "debug": request.session.debug or "",
            }
        )

    @http.route('/kitchen/data', type='json', auth='user')
    def kitchen_data(self, display_id):
        display = request.env["kitchen.display"].sudo().browse(display_id)
        if not display.exists():
            return {"stages": [], "orders": []}
        stages = [{
            "id": s.id,
            "name": s.name,
            "sequence": s.sequence,
            "alert_timer": s.alert_timer,
            "color": s.color or "#888888"
        } for s in display.stage_ids.sorted("sequence")]
        orders = request.env["kitchen.order"].sudo().search([
            ("display_id", "=", display_id)
        ])

        # Prefetch full category chain in one query to avoid N+1
        orders.mapped("line_ids").mapped("product_id.pos_categ_ids.parent_id")

        order_data = []
        for o in orders:
            lines = []
            active_lines = o.line_ids.filtered(
                lambda l: not l.is_completed
            )
            if display.product_pos_categ_ids:
                allowed_cat_ids = set(display.product_pos_categ_ids.ids)
                active_lines = active_lines.filtered(
                    lambda l: not l.product_id.pos_categ_ids or any(
                        cat_id in allowed_cat_ids
                        for cat_id in l.product_id.pos_categ_ids.ids
                    )
                )
            for l in active_lines:
                product = l.product_id
                categories   = []
                subcategories = []

                if product and product.pos_categ_ids:
                    categories    = list(set(product.pos_categ_ids.mapped("name")))
                    parent_names  = list(set(filter(
                        None,
                        product.pos_categ_ids.mapped("parent_id.name")
                    )))
                    # If the category has a parent, the parent is the "family" label.
                    # If there is no parent, fall back to the category itself.
                    subcategories = parent_names if parent_names else categories

                lines.append({
                    "id":                   l.id,
                    "product":              l.product_name,
                    "qty":                  l.qty,
                    "stage_id":             l.stage_id.id,
                    "start_time":           fields.Datetime.to_string(l.start_time),
                    "categories":           categories,
                    "subcategories":        subcategories,
                    "combo_name":           l.combo_name or "",
                    "combo_instance_uuid":  l.combo_instance_uuid or "",
                    "pos_line_uuid":        l.pos_line_uuid or "",
                    "pos_order_line_id":    l.pos_order_line_id.id if l.pos_order_line_id else None,
                    "note":                 l.note,
                    "is_cancelled":         l.is_cancelled,
                    "is_reminder":          l.is_reminder,
                    "reminder_count":       l.reminder_count,
                    'is_free':l.is_free,
                    "free_qty": l.free_qty,
                    "paid_qty": l.paid_qty,
                })

            if lines:
                table = o.pos_order_id.table_id
                order_data.append({
                    "id":         o.id,
                    "name":       o.name,
                    "table_name": o.table_name,
                    "table_id":   o.pos_order_id.table_id.id if o.pos_order_id.table_id else None,
                    "floor_name": table.floor_id.name if table and table.floor_id else "",
                    "waiter":     o.user_id.name if o.user_id else "",
                    "diners":     o.pos_order_id.customer_count or 0,
                    "order_type": o.order_type,
                    "lines":      lines,
                })
        return {
            "stages": stages,
            "orders": order_data,
            "last_update": fields.Datetime.now(),
        }

    @http.route('/kitchen/displays', type='json', auth='user')
    def kitchen_displays(self):
        displays = request.env["kitchen.display"].sudo().search([])
        return [{
            "id": d.id,
            "pos_ids": d.pos_ids.ids,
        } for d in displays]

    @http.route('/kitchen/notify_waiter', type='json', auth='user')
    def notify_waiter(self, order_id):
        kitchen_order = request.env["kitchen.order"].sudo().browse(order_id)
        if not kitchen_order.exists():
            return {"error": "Order not found"}
        pos_order = kitchen_order.pos_order_id
        if not pos_order:
            return {"error": "No linked POS order"}
        table = pos_order.table_id
        for pos in kitchen_order.display_id.pos_ids:
            channel = f"pos_config_{pos.id}"
            request.env["bus.bus"]._sendone(
                channel,
                "kitchen_order_ready",
                {
                    "order_id": kitchen_order.id,
                    "order_name": kitchen_order.name,
                    "tracking_number": kitchen_order.name,
                    "table_name": kitchen_order.table_name or "",
                    "table_id": table.id if table else None,
                    "floor_id": table.floor_id.id if table and table.floor_id else None,
                }
            )
        return {"success": True}
