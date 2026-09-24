/** @odoo-module */
import { patch } from "@web/core/utils/patch";
import { OrderWidget } from "@pos_self_order/app/components/order_widget/order_widget";
import { KioskPaymentMethodPopup } from "@agr_kiosk_pay/js/kiosk_payment_popup";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

patch(OrderWidget.prototype, {

    setup() {
        super.setup();
    },

    /**
     * We override the action prop call by wrapping the button's click.
     * When the button label is "Pay", we intercept and show our popup.
     * When it's "Order", we let the original action run as normal.
     */
    get wrappedAction() {
        const originalAction = this.props.action;
        const label = this.buttonToShow.label;

        // Only intercept when the button says "Pay"
        if (label !== _t("Pay")) {
            // Not a pay action — return original unchanged
            return originalAction;
        }

        // It IS a pay action — return our interceptor function
        return () => {
            this.dialog.add(KioskPaymentMethodPopup, {
                selfOrder: this.selfOrder,
                onPaymentMethodSelected: (paymentMethod) => {
                    // Save the chosen method onto the order
                    this.selfOrder.currentOrder.payment_method_id = paymentMethod.id;
                    // Now call the original action (proceeds to confirm/payment)
                    originalAction();
                },
            });
        };
    },
});