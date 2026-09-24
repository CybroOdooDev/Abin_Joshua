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
from odoo import fields, models


class KioskCloseSession(models.TransientModel):
    _name = "kiosk.close.session"
    _description = "Close Kiosk Session"

    pos_config_id = fields.Many2one(
        "pos.config",
        required=True,
    )

    draft_order_count = fields.Integer(
        readonly=True,
    )

    draft_order_ids = fields.Many2many(
        "pos.order",
        string="Draft Orders",
        readonly=True,
    )

    def action_cancel_orders_and_close(self):
        self.ensure_one()
        session = self.pos_config_id.current_session_id
        draft_orders = session.order_ids.filtered(
            lambda o: o.state not in ["paid", "invoiced"]
        )
        draft_orders.action_pos_order_cancel()
        return session._close_kiosk_session_common()

    def action_close_only(self):
        self.ensure_one()
        session = self.pos_config_id.current_session_id
        return session._close_kiosk_session_common()
    