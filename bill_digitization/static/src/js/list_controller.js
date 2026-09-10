/** @odoo-module **/

import { AccountMoveListController } from "@account/views/account_move_list/account_move_list_controller";
import { AccountMoveKanbanController } from "@account/views/account_move_kanban/account_move_kanban_controller";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { onWillStart, proxy } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

export function digitizeBillControllerPatch() {
    return {
        setup() {
            super.setup(...arguments);
            this.actionService = this.actionService || useService("action");
            this.orm = this.orm || useService("orm");
            this.onClickDigitize = this.onClickDigitize.bind(this);
            if (this.state) {
                this.state.button_state = false;
            } else {
                this.state = proxy({
                    button_state: false,
                });
            }

            onWillStart(async () => {
                const digitizeBillParam = await this.orm.silent.call(
                    "ir.config_parameter",
                    "get_bool",
                    ["bill_digitization.digitize_bill"]
                );
                this.state.button_state = Boolean(digitizeBillParam);
            });
        },

        /* Opening a wizard on button click */
        onClickDigitize() {
            this.actionService.doAction({
                name: _t("Upload Bill"),
                type: "ir.actions.act_window",
                res_model: "digitize.bill",
                view_mode: "form",
                views: [[false, "form"]],
                target: "new",
            });
        },
    };
}

patch(AccountMoveListController.prototype, digitizeBillControllerPatch());
patch(AccountMoveKanbanController.prototype, digitizeBillControllerPatch());
