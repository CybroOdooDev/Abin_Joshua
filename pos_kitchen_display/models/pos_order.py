# -*- coding: utf-8 -*-

from odoo import api, models
import logging
_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = "pos.order"

    @api.model
    def create_from_ui(self, orders, draft=False):
        res = super().create_from_ui(orders, draft)
        for order_payload, order_result in zip(orders, res):
            data = order_payload.get("data", {})
            if not data.get("send_to_kitchen"):
                continue
            order = self.browse(order_result["id"])
            if not order.tracking_number:
                continue

            is_kiosk = order.config_id.self_ordering_mode == "kiosk"
            if is_kiosk and order.state not in ("paid", "done", "invoiced"):
                continue
            displays = self.env["kitchen.display"].search([
                ("pos_ids", "in", order.config_id.id)
            ])

            for display in displays:
                is_new = False
                stages = display.stage_ids.sorted("sequence")
                if not stages:
                    continue

                first_stage = stages[0]

                kitchen_order = self.env["kitchen.order"].search([
                    ("display_id", "=", display.id),
                    ("pos_order_id", "=", order.id),
                ], limit=1)
                if not kitchen_order:
                    kitchen_order = self.env["kitchen.order"].create({
                        "name": str(order.tracking_number),
                        "display_id": display.id,
                        "table_name": order.table_id.name if order.table_id else "",
                        "stage_id": first_stage.id,
                        "user_id": order.user_id.id,
                        "order_type": "takeaway" if order.take_away else "dine_in",
                        "pos_order_id": order.id,
                    })
                    is_new = True
                self._sync_kitchen_lines(order, kitchen_order, first_stage)
                event_type = "new_order" if is_new else "update"
                self.env["bus.bus"]._sendone(
                    f"kitchen_display_{display.id}",
                    event_type,
                    {
                        "order_id": kitchen_order.id,
                        "display_id": display.id,
                    }
                )
                self.env["bus.bus"]._sendone(
                    f"pos_config_{order.config_id.id}",
                    "update",
                    {
                        "order_id": kitchen_order.id,
                        "display_id": display.id
                    }
                )
        return res

    def _sync_kitchen_lines(self, order, kitchen_order, first_stage):
        if order.refunded_orders_count:
            return False
        existing_lines = {
            line.pos_line_uuid: line
            for line in self.env["kitchen.order.line"].search([
                ("order_id", "=", kitchen_order.id),
            ])
            if line.pos_line_uuid
        }
        seen_uuids = set()
        new_lines = []

        for line in order.lines:
            is_combo_parent = bool(line.combo_line_ids)
            is_combo_child = bool(line.combo_parent_id)

            if is_combo_parent:
                parent_uuid = line.uuid
                seen_uuids.add(parent_uuid)

                existing = existing_lines.get(parent_uuid)

                if existing:
                    existing.write({
                        "qty": line.qty,
                        "note": line.note or "",
                        "is_cancelled": line.qty <= 0,
                    })
                else:
                    new_lines.append({
                        "order_id": kitchen_order.id,
                        "product_id": line.product_id.id,
                        "product_name": line.product_id.name,
                        "qty": line.qty,
                        "stage_id": first_stage.id,
                        "user_id": order.user_id.id,
                        "tracking_number": str(order.tracking_number),
                        "pos_line_uuid": parent_uuid,
                        "combo_instance_uuid": parent_uuid,
                        "combo_name": line.product_id.name,
                        "note": line.note or "",
                        "is_cancelled": line.qty <= 0,
                    })
                for child in line.combo_line_ids:
                    _logger.warning(
                        "KDS CHILD -> product=%s qty=%s free_qty=%s paid_qty=%s",
                        child.product_id.name,
                        getattr(child, "qty", None),
                        getattr(child, "free_qty", None),
                        getattr(child, "paid_qty", None),
                    )
                    child_uuid = child.uuid
                    seen_uuids.add(child_uuid)
                    existing_child = existing_lines.get(child_uuid)
                    free_qty = child.free_qty or 0
                    paid_qty = child.paid_qty or 0
                    # Use selected_qty as the kitchen display quantity so that
                    # standard combo children (free_qty=0, paid_qty=0) show the
                    # correct total after a parent qty change via numpad.
                    # Fall back to free+paid for allow_quantity items, then to
                    # child.qty, then to 1 as a last resort.
                    display_qty = (
                        child.selected_qty
                        if (child.selected_qty or 0) > 0
                        else (free_qty + paid_qty)
                        if (free_qty + paid_qty) > 0
                        else child.qty
                        if child.qty > 0
                        else (line.qty or 1)
                    )
                    is_free = free_qty > 0
                    if existing_child:
                        existing_child.write({
                            "qty": display_qty,
                            "note": child.note or "",
                            "free_qty": free_qty,
                            "paid_qty": paid_qty,
                            "is_free": is_free,
                            "is_cancelled": False,
                        })
                    else:
                        new_lines.append({
                            "order_id": kitchen_order.id,
                            "product_id": child.product_id.id,
                            "product_name": child.product_id.name,
                            "qty": display_qty,
                            "free_qty": child.free_qty or 0,
                            "paid_qty": child.paid_qty or 0,
                            "stage_id": first_stage.id,
                            "user_id": order.user_id.id,
                            "tracking_number": str(order.tracking_number),
                            "pos_line_uuid": child_uuid,
                            "combo_instance_uuid": parent_uuid,
                            "combo_name": line.product_id.name,
                            "note": child.note or "",
                            "is_free": is_free,
                            "is_cancelled": False,
                        })

            elif not is_combo_child:
                uuid = line.uuid
                seen_uuids.add(uuid)
                extra_uuid = uuid + "_extra"
                seen_uuids.add(extra_uuid)  # always protect _extra from deletion

                existing = existing_lines.get(uuid)
                existing_extra = existing_lines.get(extra_uuid)

                if existing:
                    delta_qty = line.qty - existing.qty
                    existing.write({
                        "qty": line.qty,
                        "note": line.note or "",
                        "is_cancelled": line.qty <= 0,
                    })
                    # if delta_qty > 0 and existing.is_completed:
                    if delta_qty > 0 and (
                            existing.is_completed or existing.stage_id.id != first_stage.id):

                        if existing_extra:
                            # Already have an _extra line — just bump its qty
                            existing_extra.write({
                                "qty": existing_extra.qty + delta_qty,
                                "note": line.note or "",
                                "is_cancelled": False,
                            })
                        else:
                            # Create a fresh _extra line for the delta
                            new_lines.append({
                                "order_id": kitchen_order.id,
                                "product_id": line.product_id.id,
                                "product_name": line.product_id.name,
                                "qty": delta_qty,
                                "stage_id": first_stage.id,
                                "user_id": order.user_id.id,
                                "tracking_number": str(order.tracking_number),
                                "pos_line_uuid": extra_uuid,
                                "combo_name": "",
                                "note": line.note or "",
                                "is_cancelled": False,
                            })
                else:
                    new_lines.append({
                        "order_id": kitchen_order.id,
                        "product_id": line.product_id.id,
                        "product_name": line.product_id.name,
                        "qty": line.qty,
                        "stage_id": first_stage.id,
                        "user_id": order.user_id.id,
                        "tracking_number": str(order.tracking_number),
                        "pos_line_uuid": uuid,
                        "combo_name": "",
                        "note": line.note or "",
                        "is_cancelled": False,
                    })

        if new_lines:
            self.env["kitchen.order.line"].create(new_lines)

        # Delete lines no longer in the POS order.
        # _extra lines are always in seen_uuids so they are never deleted here.
        for line in kitchen_order.line_ids:
            if line.pos_line_uuid and line.pos_line_uuid not in seen_uuids:
                line.unlink()

    def action_pos_order_paid(self):
        """Create kitchen order for pay at the counter."""
        res = super().action_pos_order_paid()
        for order in self:
            table = order.table_id
            if table:
                self.env["bus.bus"]._sendone(
                    f"pos_config_{order.config_id.id}",
                    "table_closed",
                    {
                        "table_id": table.id,
                        "floor_id": table.floor_id.id if table.floor_id else False,
                    }
                )
            kitchen_order = self.env["kitchen.order"].search([
                ("pos_order_id", "=", order.id)
            ], limit=1)
            if not kitchen_order:
                order._create_kitchen_order()
        return res

    def _create_kitchen_order(self):
        """Fallback used outside create_from_ui (e.g. manual trigger)."""
        self.ensure_one()
        displays = self.env["kitchen.display"].search([
            ("pos_ids", "in", self.config_id.id)
        ])
        for display in displays:
            stages = display.stage_ids.sorted("sequence")
            if not stages:
                continue
            first_stage = stages[0]
            kitchen_order = self.env["kitchen.order"].search([
                ("display_id", "=", display.id),
                ("pos_order_id", "=", self.id),
            ], limit=1)

            is_new = False

            if not kitchen_order:
                kitchen_order = self.env["kitchen.order"].create({
                    "name": str(self.tracking_number or self.name),
                    "display_id": display.id,
                    "table_name": self.table_id.name if self.table_id else "",
                    "stage_id": first_stage.id,
                    "user_id": self.user_id.id,
                    "order_type": "takeaway" if self.take_away else "dine_in",
                    "pos_order_id": self.id,
                })
                is_new = True

            self._sync_kitchen_lines(self, kitchen_order, first_stage)

            event_type = "new_order" if is_new else "update"
            self.env["bus.bus"]._sendone(
                f"kitchen_display_{display.id}",
                event_type,
                {
                    "order_id": kitchen_order.id,
                    "display_id": display.id
                }
            )