## Module <account_budget_limit_alert>

#### 29.09.2026
#### Version 19.5.1.0.0
##### MIG
- Migration to Odoo Master / 20.0 version.
- Fixed view inheritance mode in crossovered_budget_view_form so Alert Type appears in budgets.
- Made action_post multi-record and batch-safe to prevent singleton errors.
- Handled partner display gracefully when analytic accounts have no assigned partner.
- Improved analytic distribution key parsing and currency handling.
- Modernized unit tests with Command namespace and fallback account creation.

#### 22.05.2026
#### Version 19.0.1.0.0
##### ADD
- Initial commit for Account Budget Limit Alert

