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
#    You should have received a copy of the GNU LESSER GENERAL PUBLIC LICENSE
#    (LGPL v3) along with this program.
#    If not, see <http://www.gnu.org/licenses/>.
#
#############################################################################
from odoo import api, fields, models, _
from collections import defaultdict
import json
import logging

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = "pos.order"

    kiosk_tax_breakdown = fields.Text(string="Kiosk Combo Tax Breakdown (JSON)")
    kiosk_combo_tax_amount = fields.Float(string="Kiosk Combo Tax Amount")

    @api.model
    def _order_line_fields(self, line, session_id=None):
        vals = super()._order_line_fields(line, session_id)
        vals[2].update({
            "selected_qty": line[2].get("selected_qty", 0),
            "paid_qty": line[2].get("paid_qty", 0),
            "free_qty": line[2].get("free_qty", 0),
            "combo_price": line[2].get("combo_price", 0),
        })
        return vals

    @api.model
    def save_combo_line_metadata(self, line_metadata):
        """
        Persists combo pricing fields onto pos.order.line records.
        Called from JS before payment finalises.
        line_metadata: [{ id, selected_qty, paid_qty, free_qty, combo_price }, ...]
        """
        for meta in line_metadata:
            line = self.env["pos.order.line"].browse(meta["id"])
            if line.exists():
                line.write({
                    "selected_qty": meta.get("selected_qty", 0),
                    "paid_qty": meta.get("paid_qty", 0),
                    "free_qty": meta.get("free_qty", 0),
                    "combo_price": meta.get("combo_price", 0),
                })
        return True

    @api.model
    def compute_kiosk_tax_breakdown(self, payload):
        _logger.info("KIOSK TAX PAYLOAD: %s", payload)
        company = self.env.company
        tax_totals = defaultdict(float)
        tax_bases = defaultdict(float)
        tax_meta = {}
        for item in payload:
            product = self.env["product.product"].browse(
                item["product_id"]
            )
            taxes = product.taxes_id.filtered(
                lambda t: t.company_id == company
            )
            result = taxes.compute_all(
                price_unit=item["price_unit"],
                quantity=item.get("quantity", 1),
                currency=company.currency_id,
                product=product,
            )
            for tax in result["taxes"]:
                tax_totals[tax["id"]] += tax["amount"]
                tax_bases[tax["id"]] += tax["base"]
                if tax["id"] not in tax_meta:
                    record = self.env["account.tax"].browse(
                        tax["id"]
                    )
                    tax_meta[tax["id"]] = {
                        "id": record.id,
                        "name": record.name,
                        "amount": record.amount,
                    }
        return {
            "tax_details": [
                {
                    "tax": tax_meta[tax_id],
                    "amount": amount,
                    "base": tax_bases[tax_id],
                }
                for tax_id, amount in tax_totals.items()
            ]
        }

    @api.model
    def compute_pos_combo_tax_breakdown(self, payload):
        company = self.env.company
        tax_totals = defaultdict(float)
        tax_bases = defaultdict(float)
        tax_meta = {}
        for item in payload:
            product = self.env["product.product"].browse(
                item["product_id"]
            )
            tax_ids = [
                tax["id"] if isinstance(tax, dict) else tax
                for tax in item.get("tax_ids", [])
            ]
            taxes = self.env["account.tax"].browse(tax_ids)
            result = taxes.compute_all(
                price_unit=item["price_unit"],
                quantity=item.get("quantity", 1),
                currency=company.currency_id,
                product=product,
            )
            for tax in result["taxes"]:
                tax_totals[tax["id"]] += tax["amount"]
                tax_bases[tax["id"]] += tax["base"]
                if tax["id"] not in tax_meta:
                    record = self.env["account.tax"].browse(
                        tax["id"]
                    )
                    tax_meta[tax["id"]] = {
                        "id": record.id,
                        "name": record.name,
                        "amount": record.amount,
                    }
        return {
            "tax_details": [
                {
                    "tax": tax_meta[tax_id],
                    "amount": amount,
                    "base": tax_bases[tax_id],
                }
                for tax_id, amount in tax_totals.items()
            ]
        }

    def save_kiosk_tax_breakdown(self, tax_details, tax_amount):
        self.ensure_one()
        self.write({
            "kiosk_tax_breakdown": json.dumps(tax_details),
            "kiosk_combo_tax_amount": tax_amount,
        })
        return True

    def _export_for_self_order(self):
        result = super()._export_for_self_order()
        result["tracking_number"] = self.tracking_number
        return result

    def action_cancel_selected_orders(self):
        for order in self:
            if order.state not in ["paid", "invoiced", "cancel"]:
                order.action_pos_order_cancel()
        return True

    def action_open_cancel_wizard(self):
        return {
            "name": _("Cancel Orders"),
            "type": "ir.actions.act_window",
            "res_model": "pos.order.cancel",
            "view_mode": "form",
            "target": "new",
            "context": {
                "default_order_ids": [(6, 0, self.ids)],
            },
        }

    def action_cancel_order(self):
        for order in self:
            order.write({'state': 'cancel'})
        return True
