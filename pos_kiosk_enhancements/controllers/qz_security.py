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
import os
import base64

from odoo import http
from odoo.http import request
from odoo.modules.module import get_module_path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding


class QZSecurityController(http.Controller):

    def _file(self, name):
        module_path = get_module_path("pos_kiosk_enhancements")
        return os.path.join(module_path, "security", name)

    @http.route(
        "/qz/certificate",
        auth="public",
        type="http",
        csrf=False,
    )
    def certificate(self):
        with open(
            self._file("digital-certificate.txt"),
            "r"
        ) as f:
            return request.make_response(
                f.read(),
                headers=[
                    ("Content-Type", "text/plain")
                ]
            )

    @http.route(
        "/qz/sign",
        auth="public",
        type="http",
        methods=["POST"],
        csrf=False,
    )
    def sign(self):
        payload = request.httprequest.data
        with open(
            self._file("private-key.pem"),
            "rb"
        ) as f:
            private_key = serialization.load_pem_private_key(
                f.read(),
                password=None,
            )
        signature = private_key.sign(
            payload,
            padding.PKCS1v15(),
            hashes.SHA512(),
        )

        return request.make_response(
            base64.b64encode(signature),
            headers=[
                ("Content-Type", "text/plain")
            ]
        )