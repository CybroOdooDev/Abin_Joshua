/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { _t } from "@web/core/l10n/translation";
import { reactive } from "@odoo/owl";

patch(PosStore.prototype, {
    async setup(...args) {
        await super.setup(...args);
        this.readyTables = reactive(new Map());

        const bus = this.env.services.bus_service;
        const channelName = `pos_config_${this.config.id}`;
        const subscribe = async () => {
            try {
                await bus.addChannel(channelName);
            } catch (e) {
                console.warn("[POS] Subscribe failed, retrying...", e);
            }
        };

        await subscribe();
        bus.addEventListener("connect", async () => {
            await subscribe();
        });

        bus.addEventListener("notification", ({ detail: notifications }) => {
            for (const notif of notifications) {
                if (notif.type === "kitchen_order_ready") {
                    this._onKitchenOrderReady(notif.payload);
                }
            }
        });
    },
    _playWaiterSound() {
        try {
            if (!this._audioUnlocked) {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const buffer = ctx.createBuffer(1, 1, 22050);
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                source.start(0);
                this._audioUnlocked = true;
            }
            const audio = new Audio("/pos_kitchen_display/static/src/sounds/waiter_alert.wav");
            audio.play().catch(() => {});
        } catch (e) {
            console.warn("[POS] Sound failed:", e);
        }
    },
    _onKitchenOrderReady(payload) {
        const message = payload.table_name
            ? _t("Table %s — Order %s is ready!", payload.table_name, payload.tracking_number)
            : _t("Order %s is ready!", payload.order_name);

        const closeNotification = this.env.services.notification.add(message, {
            type: "success",
            title: _t("🍽️ Order Ready"),
            sticky: true,
        });
        setTimeout(() => {
            closeNotification();
        }, 10000);

        this._playWaiterSound();

        if (payload.table_id && payload.floor_id) {
            if (!this.readyTables.has(payload.floor_id)) {
                this.readyTables.set(payload.floor_id, reactive(new Set()));
            }
            this.readyTables.get(payload.floor_id).add(payload.table_id);
        }
    }
});