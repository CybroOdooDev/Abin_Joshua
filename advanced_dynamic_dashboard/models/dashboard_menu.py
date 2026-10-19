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
#############################################################################
from odoo import api, fields, models


class DashboardMenu(models.Model):
    """Class to create new dashboard menu"""
    _name = "dashboard.menu"
    _description = "Dashboard Menu"

    name = fields.Char(help="Enter a name for the dashboard menu")
    menu_id = fields.Many2one('ir.ui.menu', string="Parent Menu",
                              help="Parent Menu Location of New Dashboard",
                              ondelete='cascade')
    group_ids = fields.Many2many('res.groups', string='Groups',
                                 related='menu_id.group_ids',
                                 help="User need to be at least in one of "
                                      "these groups to see the menu")
    client_action_id = fields.Many2one('ir.actions.client',
                                       ondelete='cascade',
                                       help="Client action of the "
                                            "corresponding dashboard menu")
    child_menu_id = fields.Many2one('ir.ui.menu', string="Created Menu",
                                    ondelete='cascade',
                                    help="Menu item created for this dashboard")

    @api.model_create_multi
    def create(self, vals_list):
        """Function to create new dashboard menu"""
        if isinstance(vals_list, dict):
            vals_list = [vals_list]
        vals_list = [dict(vals) for vals in vals_list]
        for val in vals_list:
            name = val.get('name')
            parent_id = val.get('menu_id')
            if not val.get('client_action_id'):
                action = self.env['ir.actions.client'].sudo().create({
                    'name': name or 'Dashboard',
                    'tag': 'AdvancedDynamicDashboard',
                })
                val['client_action_id'] = action.id
            else:
                action = self.env['ir.actions.client'].sudo().browse(val['client_action_id'])
            if not val.get('child_menu_id'):
                menu = self.env['ir.ui.menu'].sudo().create({
                    'name': name or 'Dashboard',
                    'parent_id': parent_id,
                    'action': f'ir.actions.client,{action.id}',
                })
                val['child_menu_id'] = menu.id
        return super().create(vals_list)

    def write(self, vals):
        """Function to save edited data in dashboard menu"""
        res = super().write(vals)
        for rec in self:
            if 'name' in vals and rec.client_action_id:
                rec.client_action_id.sudo().write({'name': vals['name']})
            menu_vals = {}
            if 'name' in vals:
                menu_vals['name'] = vals['name']
            if 'menu_id' in vals:
                menu_vals['parent_id'] = vals['menu_id']
            if menu_vals:
                if rec.child_menu_id:
                    rec.child_menu_id.sudo().write(menu_vals)
                elif rec.client_action_id:
                    menus = self.env['ir.ui.menu'].sudo().search([
                        ('action', '=', f'ir.actions.client,{rec.client_action_id.id}')
                    ])
                    menus.write(menu_vals)
        return res

    def unlink(self):
        """Delete dashboard along with menu item and client action"""
        menus_to_delete = self.env['ir.ui.menu']
        actions_to_delete = self.env['ir.actions.client']
        for rec in self:
            if rec.child_menu_id:
                menus_to_delete |= rec.child_menu_id
            elif rec.client_action_id:
                menus_to_delete |= self.env['ir.ui.menu'].sudo().search([
                    ('action', '=', f'ir.actions.client,{rec.client_action_id.id}')
                ])
            if rec.client_action_id:
                actions_to_delete |= rec.client_action_id
        res = super().unlink()
        if menus_to_delete:
            menus_to_delete.sudo().unlink()
        if actions_to_delete:
            actions_to_delete.sudo().unlink()
        return res
