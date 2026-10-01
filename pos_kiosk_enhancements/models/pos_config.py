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
from odoo.exceptions import UserError


class PosConfig(models.Model):
    """Inheriting pos config model to add the fields to configure the opening and closing time."""
    _inherit = 'pos.config'

    kiosk_use_schedule = fields.Boolean(
        string="Use Kiosk Schedule"
    )

    kiosk_no_time_limit = fields.Boolean(
        string="No Time Limit",
    )

    kiosk_open_from = fields.Float(
        string="Kiosk Open From",
        help="Example: 10.0 = 10:00 AM"
    )

    kiosk_open_to = fields.Float(
        string="Kiosk Open To",
        help="Example: 20.0 = 8:00 PM"
    )

    kiosk_closed_message = fields.Char(
        string="Closed Screen Message",
        default="We are currently closed"
    )
    show_barcode = fields.Boolean(
        string="Barcode"
    )
    show_qr = fields.Boolean(
        string="Qrcode"
    )
    show_both = fields.Boolean(
        string="Show Both QR and Barcode"
    )
    printer_name =  fields.Char(
        string="USB Printer",
        help="Name of the USB Printer",)

    draft_order_ids = fields.Many2many(
        "pos.order",
        string="Draft Orders",
        readonly=True,
    )

    def _get_self_ordering_data(self):
        """The function is used to load the fields"""
        data = super()._get_self_ordering_data()
        data["config"]["kiosk_open_to"] = self.kiosk_open_to
        data["config"]["kiosk_open_from"] = self.kiosk_open_from
        data["config"]["kiosk_use_schedule"] = self.kiosk_use_schedule
        data["config"]["kiosk_no_time_limit"] = self.kiosk_no_time_limit
        data["config"]["kiosk_closed_message"] = self.kiosk_closed_message
        data["config"]["show_barcode"] = self.show_barcode
        data["config"]["show_both"] = self.show_both
        data["config"]["show_qr"] = self.show_qr
        data["config"]["printer_name"] = self.printer_name

        configured_categs = self._get_available_categories()
        configured_ids = set(configured_categs.ids)
        child_categs = self.env["pos.category"].search([
            ("parent_id", "in", list(configured_ids)),
        ])

        all_categs = {c.id: c for c in configured_categs}
        for child in child_categs:
            all_categs.setdefault(child.id, child)

        # Serialise with parent_id so the JS can group them.
        data["pos_category"] = [
            {
                "id":        c.id,
                "name":      c.name,
                "sequence":  c.sequence,
                "has_image": c.has_image,
                # parent_id is a Many2one → send [id, name] tuple or False
                "parent_id": [c.parent_id.id, c.parent_id.name]
                             if c.parent_id else False,
            }
            for c in all_categs.values()
        ]

        return data

    @api.constrains('show_qr', 'show_barcode', 'show_both')
    def _check_ticket_identifier_options(self):
        """The function sis used to check the conditions for enabling the options to show in the receipt"""
        for rec in self:
            if rec.show_qr and rec.show_barcode:
                raise UserError(
                    "To show both 'QR' and 'Barcode' in receipts please enable the 'Show Both' options."
                )
            if rec.show_both and (rec.show_qr or rec.show_barcode):
                raise UserError(
                    "'Show Both' cannot be selected together with "
                    "'Show QR Code' or 'Show Barcode'."
                )

    @api.constrains('kiosk_no_time_limit', 'kiosk_use_schedule')
    def _check_kiosk_mode(self):
        """The function is used to check whether the kiosk no time limit or schedule are not enabled at the same time ."""
        for rec in self:
            if rec.kiosk_no_time_limit and rec.kiosk_use_schedule:
                raise UserError(_("You can enable either 'No Time Limit' or 'Use Schedule', not both."))

    def action_open_wizard(self):
        """This is the existing function that opens the kiosk, supering this functions to open the kiosk based on the fields that we enabled."""
        self.ensure_one()
        if self.self_ordering_mode == 'kiosk':
            if not self.kiosk_no_time_limit and not self.kiosk_use_schedule:
                raise UserError(_("Please enable either 'No Time Limit' or 'Use Schedule' to start the Kiosk"))
            if self.kiosk_use_schedule:
                if self.kiosk_open_from == self.kiosk_open_to:
                    raise UserError(_("Please configure valid kiosk sales hours."))
        return super().action_open_wizard()

    def _get_combos_data(self):
        """The function is used to load the fields in the combos"""
        result = super()._get_combos_data()
        # result = list of dicts
        combos = self.env["pos.combo"].browse([c['id'] for c in result])
        combo_map = {combo.id: combo for combo in combos}
        for combo_dict in result:
            combo = combo_map.get(combo_dict['id'])
            combo_dict['allow_quantity'] = combo.allow_quantity if combo else False
            combo_dict['free_limit'] = combo.free_limit if combo else False
        return result

    def action_close_kiosk_session(self):
        self.ensure_one()

        session = self.current_session_id

        if not session:
            return False

        draft_orders = session.order_ids.filtered(
            lambda o: o.state not in ["paid", "invoiced"]
        )

        if draft_orders:
            wizard = self.env['kiosk.close.session'].create({
                'pos_config_id': self.id,
                'draft_order_count': len(draft_orders),
                'draft_order_ids': [(6, 0, draft_orders.ids)],
            })

            return {
                "name": _("Close Kiosk Session"),
                "type": "ir.actions.act_window",
                "res_model": "kiosk.close.session",
                "res_id": wizard.id,
                "view_mode": "form",
                "target": "new",
            }
        else:
            return session._close_kiosk_session_common()
