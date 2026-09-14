# -*- coding: utf-8 -*-
#############################################################################
#
#    Cybrosys Technologies Pvt. Ltd.
#
#    Copyright (C) 2026-TODAY Cybrosys Technologies(<https://www.cybrosys.com>)
#    Author: Cybrosys Techno Solutions(<https://www.cybrosys.com>)
#
#    You can modify it under the terms of the GNU AFFERO
#    GENERAL PUBLIC LICENSE (AGPL v3), Version 3.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU AFFERO GENERAL PUBLIC LICENSE (AGPL v3) for more details.
#
#    You should have received a copy of the GNU AFFERO GENERAL PUBLIC LICENSE
#    (AGPL v3) along with this program.
#    If not, see <http://www.gnu.org/licenses/>.
#
#############################################################################
from odoo import models
from odoo.tools import SQL


def get_query(self, args, operation, field, start_date=None, end_date=None,
              group_by=False, apply_ir_rules=False):
    """ Dashboard block Query Creation """
    query = self._search(
        domain=args,
        offset=0,
        limit=None,
        order=None,
        active_test=True,
        bypass_access=not apply_ir_rules,
    )

    join_sql = None
    group_by_sql = None

    if operation:
        op_str = operation.upper()
        if op_str not in ('SUM', 'AVG', 'COUNT', 'MAX', 'MIN'):
            op_str = 'COUNT'
        field_name = field.name if field else 'id'
        select_value = SQL("COALESCE(%s(%s), 0) AS value", SQL(op_str), SQL.identifier(self._table, field_name))

        if group_by:
            if group_by.ttype == 'many2one' and group_by.relation in self.env:
                rel_model = self.env[group_by.relation]
                rel_table = rel_model._table
                rec_name = rel_model._rec_name_fallback()
                join_sql = SQL("INNER JOIN %s ON %s = %s",
                               SQL.identifier(rel_table),
                               SQL.identifier(rel_table, 'id'),
                               SQL.identifier(self._table, group_by.name))
                select_sql = SQL("%s, %s AS %s",
                                 select_value,
                                 SQL.identifier(rel_table, rec_name),
                                 SQL.identifier(group_by.name))
                group_by_sql = SQL("GROUP BY %s", SQL.identifier(rel_table, rec_name))
            else:
                select_sql = SQL("%s, %s AS %s",
                                 select_value,
                                 SQL.identifier(self._table, group_by.name),
                                 SQL.identifier(group_by.name))
                group_by_sql = SQL("GROUP BY %s", SQL.identifier(self._table, str(group_by.name)))
        else:
            select_sql = select_value
    else:
        select_sql = SQL("%s AS id", SQL.identifier(self._table, 'id'))

    if start_date and start_date != 'null':
        query.add_where(SQL('%s >= %s', SQL.identifier(self._table, 'create_date'), start_date))
    if end_date and end_date != 'null':
        query.add_where(SQL('%s <= %s', SQL.identifier(self._table, 'create_date'), end_date))

    from_clause = SQL("%s %s", query.from_clause, join_sql) if join_sql else query.from_clause
    where_clause = SQL("WHERE %s", query.where_clause) if query._where_clauses else SQL("")

    final_query = SQL("SELECT %s FROM %s %s %s",
                      select_sql,
                      from_clause,
                      where_clause,
                      group_by_sql or SQL(""))
    return final_query


models.BaseModel.get_query = get_query
