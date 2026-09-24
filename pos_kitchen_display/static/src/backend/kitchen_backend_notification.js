/** @odoo-module **/

import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";

export const kitchenBackendNotificationService = {
    dependencies: ["bus_service", "notification"],
    async start(env, { bus_service, notification }) {
        let displays = [];
        try {
            const response = await fetch("/kitchen/displays", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "call",
                    params: {},
                    id: 1,
                }),
            });
            const json = await response.json();
            displays = json.result || [];
        } catch (e) {
            console.warn("[KDS] Failed to fetch displays:", e);
            return;
        }
        for (const display of displays) {
            if (display.pos_ids && display.pos_ids.length) {
                for (const posId of display.pos_ids) {
                    await bus_service.addChannel(`pos_config_${posId}`);
                }
            }
        }

        bus_service.addEventListener(
            "notification",
            ({ detail: notifications }) => {
                for (const { type, payload } of notifications) {
                    if (type === "kitchen_order_ready") {
                        const message = payload.table_name
                            ? _t("Table %s — Order %s is ready!", payload.table_name, payload.order_name)
                            : _t("Order %s is ready!", payload.order_name);

                        const closeNotification = notification.add(message, {
                            type: "success",
                            title: _t("🍽️ Order Ready"),
                            sticky: true,
                        });
                        setTimeout(() => {
                            closeNotification();
                        }, 10000);
                    }
                }
            }
        );
    },
};

registry.category("services").add(
    "kitchen_backend_notification",
    kitchenBackendNotificationService
);
