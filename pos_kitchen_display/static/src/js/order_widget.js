/** @odoo-module */
import { patch } from "@web/core/utils/patch";
import { OrderWidget } from "@pos_self_order/app/components/order_widget/order_widget";
import { KioskPaymentMethodPopup } from "@agr_kiosk_pay/js/kiosk_payment_popup";
import { KioskConfirmPopup } from "@pos_kitchen_display/js/kiosk_confirm_popup";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

patch(OrderWidget.prototype, {
    setup() {
        super.setup();
        this.dialog = useService("dialog");
    },

    get wrappedAction() {
        const originalAction = this.props.action;
        const label = this.buttonToShow.label;

        // Only intercept Pay
        if (label !== _t("Pay")) {
            return originalAction;
        }

        return () => {
            this.dialog.add(KioskConfirmPopup, {
                title: _t("Please review your order"),
                confirm: () => {
                    this.dialog.add(KioskPaymentMethodPopup, {
                        selfOrder: this.selfOrder,
                        onPaymentMethodSelected: (paymentMethod) => {
                            this.selfOrder.currentOrder.payment_method_id = paymentMethod.id;
                            originalAction();
                        },
                    });
                },
                cancel: () => {},
            });
        };
    },
});