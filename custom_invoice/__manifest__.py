{
    'name': 'Custom Invoice Sequence',
    'version': '20.0.1.0.0',
    'category': 'Accounting',
    'summary': 'Start customer invoice numbering from 1000 (configurable per journal).',
    'description': """
Custom Invoice Sequence
=======================
Automatically starts customer invoice numbering from 1000 (configurable on each Sales journal)
without altering the journal prefix or format.
    """,
    'author': 'Cybrosys Techno Solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': 'https://www.cybrosys.com',
    'depends': ['account'],
    'data': [
        'views/account_journal_views.xml',
    ],
    'license': 'LGPL-3',
    'installable': True,
    'auto_install': False,
    'application': False,
}
