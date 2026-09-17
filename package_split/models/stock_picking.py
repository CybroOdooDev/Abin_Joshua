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
from odoo import models
from collections import defaultdict


class StockPicking(models.Model):
    """Inheriting the stock picking model to change the package creation method
    based on package category provided inside the product form."""
    _inherit = 'stock.move.line'

    def action_put_in_pack(self, *, package_id=False, package_type_id=False, package_name=False, package_capacity=None, **kwargs):
        """For each product in the orderline with the same package category,
            it creates packages and adds the corresponding products into the
            package when validating the delivery"""

        move_lines = self
        if package_capacity and package_capacity != self.quantity:
            return move_lines._split_in_chunk(package_capacity, package_type_id, package_id=package_id)

        if self.env.context.get('all_move_line_ids'):
            move_lines = self.env['stock.move.line'].browse(self.env.context['all_move_line_ids'])

        # From the 'Moves' button, we want to take all move lines
        force_move_lines = bool(self.env.context.get('force_move_lines'))

        # Get lines to pack
        move_lines_to_pack, packages_to_pack = move_lines._get_lines_and_packages_to_pack(
            picked_first=not force_move_lines)

        if not move_lines_to_pack:
            if packages_to_pack:
                return packages_to_pack.action_put_in_pack(
                    package_id=package_id,
                    package_type_id=package_type_id,
                    package_name=package_name,
                )
            return False

        # Check for pre-pack hook
        action = move_lines_to_pack._pre_put_in_pack_hook(
            move_lines,
            package_id,
            package_type_id,
            package_name,
            self.env.context.get('from_package_wizard')
        )
        if action:
            return action

        # Group move lines by package category
        move_lines_by_category = defaultdict(lambda: self.env['stock.move.line'])

        for move_line in move_lines_to_pack:
            category = move_line.product_id.package_category_id
            move_lines_by_category[category] |= move_line

        packages = self.env['stock.package']

        for category, lines in move_lines_by_category.items():
            # Get package type from the first move line's packaging UoM if not provided
            pkg_type_id = package_type_id
            if not pkg_type_id and lines and lines[0].move_id and lines[0].move_id.packaging_uom_id.package_type_id:
                pkg_type_id = lines[0].move_id.packaging_uom_id.package_type_id.id

            # Create package using standard method
            package = lines._put_in_pack(
                package_id=False,
                package_type_id=pkg_type_id,
                package_name=package_name
            )

            if package:
                # Update package name with category
                if category:
                    new_package_name = f"{package.name}-{category.name}"
                    package.write({'name': new_package_name})
                packages |= package
                # Call post-pack hook for each package
                hook_action = lines._post_put_in_pack_hook(package)
                if isinstance(hook_action, dict):
                    return hook_action

        # Handle remaining packages_to_pack if any
        if packages_to_pack:
            if packages:
                packages_to_pack -= packages
                package_id = packages[0].id if packages else False
            if packages_to_pack:
                additional_packages = packages_to_pack.action_put_in_pack(
                    package_id=package_id,
                    package_type_id=package_type_id,
                    package_name=package_name,
                )
                if additional_packages:
                    packages |= additional_packages

        # Return first package or False (standard behavior)
        return packages[0] if packages else False
