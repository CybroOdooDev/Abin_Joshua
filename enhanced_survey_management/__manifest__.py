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
{
    'name': 'Enhanced Survey Management',
    'version': '20.0.1.0.0',
    'category': 'Extra Tools',
    'summary': 'Enhance your survey management with new question kinds and more',
    'description': """Upgrade your survey management capabilities with the
addition of versatile question types.
Capture specific timeframes by incorporating questions
about the month, week, or range, enabling finer data analysis.
Furthermore, enhance data collection by allowing
respondents to upload files, fostering a more comprehensive
understanding of their experiences.
Explore these new question types and optimize your survey
strategy for enhanced insights.""",
    'author': 'Cybrosys Techno Solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': "https://www.cybrosys.com",
    'depends': ['base', 'survey', 'website'],
    'data': [
        'data/enhanced_survey_management_data.xml',
        'security/ir.access.csv',
        'views/survey_templates.xml',
        'views/survey_question_views.xml',
        'views/survey_input_print_templates.xml',
        'views/survey_portal_templates.xml',
        'views/survey_user_views.xml',
        'views/survey_survey_views.xml'
    ],
    'assets': {
        'survey.survey_assets': [
            'enhanced_survey_management/static/src/js/survey_form.js',
            'enhanced_survey_management/static/src/js/survey_submit.js',
        ],
    },
    'images': [
        'static/description/banner.jpg',
    ],
    'license': 'LGPL-3',
    'installable': True,
    'auto_install': False,
    'application': False,
}
