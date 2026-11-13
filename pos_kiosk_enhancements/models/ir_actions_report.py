# -- coding: utf-8 --
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
import io
import logging
from odoo import models, api

_logger = logging.getLogger(__name__)

try:
    import barcode
    from barcode.writer import ImageWriter
except ImportError:
    barcode = None

try:
    import qrcode
except ImportError:
    qrcode = None


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    @api.model
    def barcode(self, barcode_type, value, **kwargs):
        try:
            return super().barcode(barcode_type, value, **kwargs)
        except Exception as e:
            _logger.info("ReportLab barcode generation failed (%s), falling back to PIL generators", e)
            b_type = (barcode_type or '').upper()
            if b_type == 'QR' and qrcode:
                buffer = io.BytesIO()
                img = qrcode.make(value)
                img.save(buffer, format='PNG')
                return buffer.getvalue()
            elif barcode:
                buffer = io.BytesIO()
                try:
                    bc_cls = barcode.get_barcode_class(barcode_type.lower())
                except Exception:
                    bc_cls = barcode.get_barcode_class('code128')
                bc = bc_cls(value, writer=ImageWriter())
                bc.write(buffer, options={'write_text': False})
                return buffer.getvalue()
            raise
