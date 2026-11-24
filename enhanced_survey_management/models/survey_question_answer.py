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
from odoo import fields, models


class SurveyQuestionAnswer(models.Model):
    """Inherit question answer model to add new answer type and model field"""
    _inherit = 'survey.question.answer'

    answer_type = fields.Selection(
        selection=[
            ('text_box', 'Multiple Lines Text Box'),
            ('char_box', 'Single Line Text Box'),
            ('numerical_box', 'Numerical Value'),
            ('date', 'Date'),
            ('datetime', 'Datetime'),
            ('time', 'Time'),
            ('email', 'Email'),
            ('password', 'Password'),
            ('range', 'Range'),
            ('month', 'Month'),
            ('url', 'URL'),
            ('week', 'Week'),
            ('color', 'Color'),
            ('many2one', 'Many2one'),
        ],
        help="Answer type",
        readonly=False,
        store=True,
    )
    model_id = fields.Many2one(
        'ir.model',
        domain=[('transient', '=', False)],
        help="Select model for getting it's values in survey"
    )
