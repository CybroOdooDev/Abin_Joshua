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
from odoo.addons.portal.controllers.portal import CustomerPortal


class SurveyAnswerPortal(CustomerPortal):
    """Inherited CustomerPortal to add survey portal view"""

    def _prepare_home_portal_values(self, counters):
        """Prepare portal values for participant's attended surveys count"""
        values = super()._prepare_home_portal_values(counters) if hasattr(super(), '_prepare_home_portal_values') else {}
        if 'survey_count' in counters:
            partner = request.env.user.partner_id
            values['survey_count'] = request.env[
                'survey.user_input'].sudo().search_count([
                ('partner_id', '=', partner.id),
                ('survey_id.visibility', '=', True),
                ('test_entry', '=', False),
            ])
        return values


class SurveyPortalView(http.Controller):
    """Survey portal controller"""

    @http.route('/my/survey/ans', type='http', auth="user", website=True)
    def portal_my_survey(self):
        """Controller to display participant's attended surveys in portal"""
        partner = request.env.user.partner_id
        user_inputs = request.env['survey.user_input'].sudo().search([
            ('partner_id', '=', partner.id),
            ('survey_id.visibility', '=', True),
            ('test_entry', '=', False),
        ])
        state_sel = dict(
            request.env['survey.user_input']._fields['state']
            ._description_selection(request.env)
        )
        values = {
            'survey_list': [{
                'id': rec.survey_id.id,
                'survey': rec.survey_id.title,
                'user_id': partner.name,
                'email': partner.email,
                'status': state_sel.get(rec.state, rec.state),
            } for rec in user_inputs],
            'page_name': 'survey',
        }
        return request.render(
            "enhanced_survey_management.portal_survey_result", values)

    @http.route('/my/survey/<int:survey_id>', type="http", auth="user",
                website=True)
    def survey_view(self, survey_id):
        """Controller function to view participant's answers for a specific survey"""
        partner = request.env.user.partner_id
        survey = request.env['survey.survey'].sudo().browse(survey_id)
        if not survey.exists() or not survey.visibility:
            return request.not_found()

        user_inputs = request.env['survey.user_input'].sudo().search([
            ('survey_id', '=', survey_id),
            ('partner_id', '=', partner.id),
        ])
        if not user_inputs:
            return request.redirect('/my/survey/ans')

        survey_questions_line = request.env[
            'survey.user_input.line'].sudo().search([
            ('user_input_id', 'in', user_inputs.ids)])

        question_list = []
        for res in survey_questions_line:
            question_list.append({
                'id': res.question_id.id,
                'questions': res.question_id.title,
                'section': res.create_date,
                'create_date': res.create_date,
                'question_type': res.question_id.question_type or res.answer_type,
                'score': res.answer_score,
                'answer': res.display_name,
            })
        values = {
            'survey_questions': question_list,
            'survey': survey.title,
            'survey_date': survey.create_date,
            'name': partner.name,
            'email': partner.email,
            'access_token': survey.access_token,
            'page_name': 'survey',
            'survey_boolean': True,
        }
        return request.render(
            "enhanced_survey_management.portal_survey_result_view", values)


class SurveyLoadContent(http.Controller):
    """Controller to load country and state to the survey"""

    @http.route('/survey/load_country', type="jsonrpc", auth="public",
                website=True)
    def load_country(self):
        """Function to return country names for question type country"""
        country_ids = request.env['res.country'].sudo().search([])
        return {
            'id': country_ids.mapped('id'),
            'name': country_ids.mapped('name'),
        }

    @http.route('/survey/load_states', type="jsonrpc", auth="public",
                website=True)
    def load_states(self, country_id=None, **kwargs):
        """Function to return state names based on country"""
        country_name = (
            country_id
            or kwargs.get('country_id')
            or kwargs.get('params', {}).get('country_id')
        )
        country = request.env['res.country'].sudo().search([
            ('name', '=', country_name)], limit=1) if country_name else False
        state_ids = (
            request.env['res.country.state'].sudo().search([
                ('country_id', '=', country.id)
            ]) if country else request.env['res.country.state']
        )
        return {
            'id': state_ids.mapped('id'),
            'name': state_ids.mapped('name'),
        }
