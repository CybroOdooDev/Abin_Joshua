# -*- coding: utf-8 -*-
from odoo import models, api


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _loader_params_restaurant_table(self):
        params = super()._loader_params_restaurant_table()
        params['search_params']['fields'].extend([
            'table_type',
            'is_decoration',
            'decor_preset_id',
            'image_url',
            'custom_image',
            'show_label',
            'show_seats',
            'rotation',
            'z_index',
        ])
        return params

    @api.model
    def get_saved_decor_images(self, session_id=None):
        """ Return all saved decor/table custom images available in the system for reuse. """
        Attachment = self.env['ir.attachment'].sudo()
        domain = [
            '|',
            ('res_model', '=', 'pos.restaurant.decor'),
            ('description', '=', 'pos_saved_decor_image'),
        ]
        attachments = Attachment.search(domain, order='id desc')

        saved_images = []
        known_signatures = set()

        for att in attachments:
            datas = att.datas
            if not datas:
                continue
            datas_str = datas.decode('utf-8') if isinstance(datas, bytes) else str(datas)
            sig = (len(datas_str), datas_str[:50], datas_str[-50:])
            if sig in known_signatures:
                continue
            known_signatures.add(sig)

            saved_images.append({
                'id': att.id,
                'name': att.name or 'Custom Decor Graphic',
                'custom_image': datas_str,
                'is_decoration': True,
                'seats': 0,
                'table_type': 'decoration',
            })

        # Auto-import any custom images already present on existing restaurant tables
        tables = self.env['restaurant.table'].sudo().search([('custom_image', '!=', False)], order='id desc')
        for t in tables:
            t_datas = t.custom_image
            if not t_datas:
                continue
            t_datas_str = t_datas.decode('utf-8') if isinstance(t_datas, bytes) else str(t_datas)
            sig = (len(t_datas_str), t_datas_str[:50], t_datas_str[-50:])
            if sig in known_signatures:
                continue
            known_signatures.add(sig)

            # Persist in ir.attachment so it remains even if this table is deleted or altered
            new_att = Attachment.create({
                'name': t.name or 'Saved Floor Decor',
                'datas': t_datas,
                'res_model': 'pos.restaurant.decor',
                'res_id': 0,
                'description': 'pos_saved_decor_image',
                'public': True,
                'mimetype': 'image/png',
            })
            saved_images.append({
                'id': new_att.id,
                'name': new_att.name,
                'custom_image': t_datas_str,
                'is_decoration': bool(t.is_decoration),
                'seats': t.seats or 0,
                'table_type': t.table_type or 'table',
            })

        return saved_images

    @api.model
    def save_decor_image(self, session_id, name, image_base64, is_decoration=True, seats=0, table_type='decoration'):
        """ Persist a custom image in the system so it can be reused across any table or floor. """
        if not image_base64:
            return False

        if isinstance(image_base64, str) and ',' in image_base64:
            image_base64 = image_base64.split(',', 1)[1]

        Attachment = self.env['ir.attachment'].sudo()
        vals = {
            'name': name or 'Custom Decor Graphic',
            'datas': image_base64,
            'res_model': 'pos.restaurant.decor',
            'res_id': 0,
            'description': 'pos_saved_decor_image',
            'public': True,
            'mimetype': 'image/png',
        }
        att = Attachment.create(vals)

        # Also populate dedicated model restaurant.decor.image if its table exists
        self.env.cr.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'restaurant_decor_image'
            );
        """)
        if self.env.cr.fetchone()[0]:
            try:
                self.env['restaurant.decor.image'].sudo().create({
                    'name': name or 'Custom Decor Graphic',
                    'image': image_base64,
                    'is_decoration': bool(is_decoration),
                    'seats': seats or 0,
                    'table_type': table_type or 'decoration',
                })
            except Exception:
                pass

        datas_str = att.datas.decode('utf-8') if isinstance(att.datas, bytes) else str(att.datas)
        return {
            'id': att.id,
            'name': att.name,
            'custom_image': datas_str,
            'is_decoration': bool(is_decoration),
            'seats': seats or 0,
            'table_type': table_type or 'decoration',
        }

    @api.model
    def delete_saved_decor_image(self, session_id, attachment_id):
        """ Delete a saved image from the system library. """
        if not attachment_id:
            return False
        att = self.env['ir.attachment'].sudo().browse(attachment_id)
        if att.exists():
            att.unlink()
            return True
        return False
