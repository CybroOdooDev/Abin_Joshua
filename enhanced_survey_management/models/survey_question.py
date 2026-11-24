# -*- coding: utf-8 -*-
###############################################################################
#
#    Cybrosys Technologies Pvt. Ltd.
#    Copyright (C) 2026-TODAY Cybrosys Technologies(<https://www.cybrosys.com>).
#    Author: Cybrosys Techno Solutions(<https://www.cybrosys.com>)
#
#    This program is free software: you can modify
#    it under the terms of the GNU LESSER GENERAL PUBLIC LICENSE (LGPL) as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU LESSER GENERAL PUBLIC LICENSE for more details.
#
#    You should have received a copy of the GNU LESSER GENERAL PUBLIC LICENSE
#    along with this program.  If not, see <https://www.gnu.org/licenses/>.
#
###############################################################################
from odoo import api, fields, models
from odoo.exceptions import ValidationError


class SurveyQuestion(models.Model):
    """ Inherited survey.question to add custom question type"""
    _inherit = 'survey.question'

    selection_ids = fields.One2many(
        'question.selection',
        'question_id',
        string='Select',
        help="""Field used to create selection type questions"""
    )
    question_type = fields.Selection(selection_add=[
        ('time', 'Time'),
        ('month', 'Month'),
        ('name', 'Name'),
        ('address', 'Address'),
        ('email', 'Email'),
        ('password', 'Password'),
        ('qr', 'Qrcode'),
        ('url', 'URL'),
        ('week', 'Week'),
        ('color', 'Color'),
        ('range', 'Range'),
        ('many2one', 'Many2one'),
        ('file', 'Upload File'),
        ('many2many', 'Many2many'),
        ('selection', 'Selection'),
        ('barcode', 'Barcode')
    ], help="Survey supported question types")
    matrix_subtype = fields.Selection(
        selection_add=[('custom', 'Custom Matrix')],
        help="""Matrix selection type question""")
    model_id = fields.Many2one(
        'ir.model',
        domain=[('transient', '=', False)],
        help="Many2one type question"
    )
    range_min = fields.Integer(
        string='Min',
        help='Minimum range,range type question'
    )
    range_max = fields.Integer(
        string='Max',
        help='Maximum range,range type question'
    )
    qrcode = fields.Text(help='Show qrcode in survey')
    qrcode_png = fields.Binary(help="Qrcode PNG")
    barcode = fields.Char(help="Barcode number")
    barcode_png = fields.Binary(help="Saves barcode png file")

    @api.constrains('barcode')
    def _check_barcode(self):
        """Constraint function to restrict barcode to exactly 12 digits"""
        for record in self:
            if record.barcode:
                if len(record.barcode) < 12:
                    raise ValidationError(
                        self.env._("Make sure barcode is at least 12 letters"))
                if len(record.barcode) > 12:
                    raise ValidationError(
                        self.env._("There should not be more than 12 "
                                  "characters in a barcode"))
                if not record.barcode.isdigit():
                    raise ValidationError(
                        self.env._("Only digits are allowed."))

    def _onchange_barcode(self):
        """Compatibility method for barcode validation"""
        self._check_barcode()

    def get_selection_values(self):
        """Function return options for selection type question"""
        return self.selection_ids

    def prepare_model_id(self, model):
        """Function to return options for many2one question"""
        target_model_name = model.model if model else (
            self.model_id.model if self.model_id else False
        )
        if not target_model_name or target_model_name not in self.env:
            return []

        Model = self.env[target_model_name]
        if Model._abstract:
            return []

        model_data = Model.sudo().search([], limit=100)
        return [rec.read([model_data._rec_name])[0] for rec in model_data]
