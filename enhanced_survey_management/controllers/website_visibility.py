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
from odoo import http
from odoo.http import request


class WebsiteView(http.Controller):
    """Inherited http.Controller to add custom route"""

    @http.route('/public/survey', type='http', auth="public",
                website=True)
    def public_user_access(self):
        """ Controller function to access survey from website """
        survey = request.env['survey.survey'].sudo().search(
            [('access_mode', '=', 'website')])
        values = {
            'survey_list': [{
                'title': rec.title,
                'attempts': rec.attempts_limit,
                'date': rec.create_date,
                'access_token': rec.access_token
            } for rec in survey],
            'page_name': 'survey',
        }
        return request.render("enhanced_survey_management.survey_visibility",
                              values)
