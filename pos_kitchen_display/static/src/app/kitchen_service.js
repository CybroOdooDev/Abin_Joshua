/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { reactive, useState } from "@odoo/owl";

const POLL_INTERVAL_MS = 15000;

export const kitchenService = {
    dependencies: ["bus_service"],
    async start(env, { bus_service }) {
        if (typeof odoo === "undefined" || !odoo.kitchen_display) {
            console.error("[KDS] odoo.kitchen_display missing");
            return reactive({ stages: new Map(), orders: [], reminderPopups: [] });
        }
        const displayId = odoo.kitchen_display.id;
        const posId     = odoo.kitchen_display.pos_ids;

        async function fetchData() {
            try {
                const response = await fetch("/kitchen/data", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "call",
                        params: { display_id: displayId },
                        id: 1,
                    }),
                });
                const json = await response.json();
                return json.result;
            } catch (err) {
                console.error("[KDS] fetchData error:", err);
                return null;
            }
        }
        const state = reactive({
            stages: new Map(),
            orders: [],
            reminderPopups: [],
        });

        let lastReloadTime = 0;
        let pollTimer      = null;

        async function reload() {
            lastReloadTime = Date.now();
            const data = await fetchData();
            if (!data) {
                console.warn("[KDS] fetchData returned null, will retry on next poll");
                return;
            }
            state.orders = data.orders;
            const newStages = new Map();
            data.stages.forEach(stage => newStages.set(stage.id, stage));
            state.stages = newStages;
        }

        // Expose reload so components can call kitchen.reload()
        state.reload = reload;

        function schedulePoll() {
            if (pollTimer) clearTimeout(pollTimer);
            pollTimer = setTimeout(async () => {
                await reload();
                schedulePoll();
            }, POLL_INTERVAL_MS);
        }

        async function reloadAndResetPoll() {
            if (pollTimer) clearTimeout(pollTimer);
            await reload();
            schedulePoll();
        }
        await reload();
        schedulePoll();
        await bus_service.addChannel(`kitchen_display_${displayId}`);
        if (posId) {
            await bus_service.addChannel(`pos_config_${posId}`);
        }
        bus_service.addEventListener("notification", ({ detail: notifications }) => {
            for (const { payload, type } of notifications) {

                if (type === "new_order" ||  type === "update") {
                    if (payload.display_id === displayId) {
                        try {
                            const audio = new Audio(
                                "/pos_kitchen_display/static/src/sounds/kitchenorder_notification.wav"
                            );
                            audio.play();
                        } catch (e) {
                            console.warn("Sound play failed:", e);
                        }
                    }
                }

                if (
                    type === "new_order"  ||
                    type === "update"     ||
                    type === "stage_update" ||
                    type === "kitchen_order_ready"
                ) {
                    reloadAndResetPoll();
                    break;

                } else if (type === "category_reminder") {
                    // Play reminder sound
                    try {
                        const audio = new Audio(
                            "/pos_kitchen_display/static/src/sounds/reminder.wav"
                        );
                        audio.play();
                    } catch (e) {
                        console.warn("Sound play failed:", e);
                    }
                    reloadAndResetPoll();
                    const popup = {
                        id: Date.now(),
                        order_name: payload.order_name,
                        category: payload.category,
                    };

                    state.reminderPopups.push(popup);

                    // Auto-dismiss after 10 seconds
                    setTimeout(() => {
                        const index = state.reminderPopups.findIndex(
                            p => p.id === popup.id
                        );
                        if (index !== -1) {
                            state.reminderPopups.splice(index, 1);
                        }
                    }, 10000);
                }
            }
        });

        bus_service.addEventListener("connect", async () => {
            try {
                await bus_service.addChannel(`kitchen_display_${displayId}`);
                if (posId) {
                    await bus_service.addChannel(`pos_config_${posId}`);
                }
            } catch (e) {
                console.warn("[KDS] Re-subscribe error:", e);
            }
            await reloadAndResetPoll();
        });

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                const elapsed = Date.now() - lastReloadTime;
                if (elapsed > 5000) reloadAndResetPoll();
            }
        });

        return state;
    }
};

registry.category("services").add("kitchen_display", kitchenService);
export function useKitchenDisplay() {
    return useState(useService("kitchen_display"));
}