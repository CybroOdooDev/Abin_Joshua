/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { qzPrinterService } from "./QZPrinterService";
import { toJpeg } from "@point_of_sale/app/utils/html-to-image";
import { renderToElement } from "@web/core/utils/render";
import { loadAllImages } from "@point_of_sale/utils";
import { _t } from "@web/core/l10n/translation";

patch(PosStore.prototype, {
    async sendOrderInPreparationUpdateLastChange(order, cancelled = false) {
        if (this.config.enable_network_printing && this.config.enable_kitchen_printing) {
            try {
                await this.printKitchenOrder(order, cancelled);
            } catch (err) {
                console.error("Error printing kitchen preparation ticket:", err);
            }
        }
        return await super.sendOrderInPreparationUpdateLastChange(...arguments);
    },

    async printKitchenOrder(order, cancelled = false) {
        if (!order) return;

        // 1. Get changes sent to kitchen
        const changes = order.changesToOrder(cancelled);
        const hasNew = changes && changes.new && changes.new.length > 0;
        const hasCancelled = changes && changes.cancelled && changes.cancelled.length > 0;

        if (!hasNew && !hasCancelled) {
            console.log("[Kitchen Printing] No new or cancelled changes to send to kitchen.");
            return;
        }

        // 2. Prepare order metadata
        const now = new Date();
        const pad = (n) => (n < 10 ? "0" + n : n);
        const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

        const tableName = order.table
            ? order.table.name
            : (this.config.module_pos_restaurant && order.getTable ? (order.getTable()?.name || "") : "");
        const floorName = order.table && order.table.floor
            ? order.table.floor.name
            : (order.getTable && order.getTable()?.floor ? (order.getTable().floor.name || "") : "");

        const orderName = typeof order.get_name === "function" ? order.get_name() : (order.tracking_number || order.name || "");
        const cashierName = this.get_cashier ? this.get_cashier().name : (this.user ? this.user.name : "");

        // 3. Group new lines by Course / Plating Level
        const courseMap = new Map();
        const defaultCourseKey = "general";
        const defaultCourseName = this.config.module_pos_restaurant ? _t("Platos / Dishes") : _t("Comanda / Order");

        for (const change of (changes.new || [])) {
            // If this item is part of a combo, it will be rendered under its combo parent
            if (change.isPartOfCombo) {
                continue;
            }

            // Find full orderline for additional details (notes, combo, plating level)
            const line = (change.line_uuid && order.orderlines.find((l) => l.uuid === change.line_uuid)) ||
                order.orderlines.find((l) => l.product.id === change.product_id && (l.getNote ? l.getNote() : (l.note || "")) === (change.note || "")) ||
                order.orderlines.find((l) => l.product.id === change.product_id);

            // Check if plating level is available
            const platingLevel = line && typeof line.get_plating_level === "function" ? line.get_plating_level() : null;
            const courseKey = platingLevel ? `course_${platingLevel.id}` : defaultCourseKey;
            const courseName = platingLevel ? platingLevel.name : defaultCourseName;
            const courseSeq = platingLevel ? (platingLevel.sequence || 10) : 99;

            if (!courseMap.has(courseKey)) {
                courseMap.set(courseKey, {
                    id: courseKey,
                    name: courseName,
                    sequence: courseSeq,
                    lines: [],
                });
            }

            // Extract combo details if combo line
            const comboLines = [];
            const childLines = (line && line.comboLines) || (line && line.combo_line_ids) || [];
            if (childLines.length > 0) {
                for (const child of childLines) {
                    const childName = typeof child._get_kitchen_product_name === "function"
                        ? child._get_kitchen_product_name()
                        : (child.get_product ? child.get_product().display_name : (child.name || ""));
                    comboLines.push({
                        name: childName,
                        qty: child.qty || 1,
                        note: child.note || "",
                    });
                }
            }

            const productName = line && typeof line._get_kitchen_product_name === "function"
                ? line._get_kitchen_product_name()
                : change.name;

            courseMap.get(courseKey).lines.push({
                name: productName,
                qty: change.quantity,
                note: change.note || (line ? line.note : "") || "",
                comboLines: comboLines,
            });
        }

        // Sort courses by sequence
        const sortedCourses = Array.from(courseMap.values()).sort((a, b) => a.sequence - b.sequence);

        const cancelledLines = (changes.cancelled || []).map((c) => ({
            name: c.name,
            qty: c.quantity,
            note: c.note || "",
        }));

        if (sortedCourses.length === 0 && cancelledLines.length === 0) {
            console.log("[Kitchen Printing] No food items to print in kitchen ticket.");
            return;
        }

        const kitchenData = {
            orderName: orderName,
            tableName: tableName,
            floorName: floorName,
            orderType: order.take_away ? _t("PARA LLEVAR / TAKEAWAY") : _t("COMEDOR / DINE IN"),
            cashierName: cashierName,
            diners: order.customer_count || null,
            time: timeStr,
            date: dateStr,
            courses: sortedCourses,
            cancelledLines: cancelledLines,
        };

        // 4. Render KitchenOrderReceipt using renderToElement (direct QWeb DOM generation)
        let imageBase64 = null;
        let receiptEl = null;

        try {
            receiptEl = renderToElement("pos_network_printer.KitchenOrderReceipt", { data: kitchenData });
        } catch (err) {
            console.error("Failed to render kitchen ticket template:", err);
            return;
        }

        if (receiptEl) {
            const wrapper = document.createElement("div");
            wrapper.style.position = "fixed";
            wrapper.style.left = "-2000px";
            wrapper.style.top = "0";
            wrapper.style.width = "330px";
            wrapper.style.backgroundColor = "#ffffff";
            wrapper.style.pointerEvents = "none";
            wrapper.appendChild(receiptEl);
            document.body.appendChild(wrapper);

            try {
                try {
                    await loadAllImages(receiptEl);
                } catch (_) {}

                const dataUrl = await toJpeg(receiptEl, {
                    skipFonts: true,
                    backgroundColor: "#ffffff",
                    pixelRatio: 2,
                    quality: 0.95,
                });
                if (dataUrl && dataUrl !== "data:," && dataUrl.length >= 100) {
                    imageBase64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
                }
            } finally {
                wrapper.remove();
            }
        }

        if (!imageBase64) {
            console.warn("Failed to generate kitchen ticket raster image.");
            return;
        }

        const kitchenPrinterName = this.config.qz_kitchen_printer_name
            ? this.config.qz_kitchen_printer_name.trim()
            : (this.config.qz_printer_name ? this.config.qz_printer_name.trim() : null);

        // 5. Asynchronously log the kitchen ticket snapshot in pos.printed.ticket
        try {
            await this.orm.call("pos.order", "log_printed_ticket", [
                order.server_id || false,
                imageBase64,
                "kitchen",
                kitchenPrinterName || "Kitchen Printer",
                "success",
                false,
                orderName,
            ]);
        } catch (e) {
            console.warn("Could not log kitchen ticket snapshot in backend:", e);
        }

        // 6. Print via QZ Tray or skip if Simulation Mode
        if (this.config.simulation_mode) {
            console.log(`[Simulation Mode] Kitchen ticket for ${orderName} recorded without physical printing.`);
            if (this.env?.services?.notification) {
                this.env.services.notification.add(
                    _t("Kitchen ticket saved in history (Simulation Mode: physical print skipped)"),
                    { type: "info" }
                );
            }
        } else {
            console.log(`[Kitchen Printing] Dispatching kitchen ticket for ${orderName} to printer: ${kitchenPrinterName || "Default"}`);
            const printRes = await qzPrinterService.printReceiptImage(imageBase64, kitchenPrinterName);
            console.log(`[Kitchen Printing] Successfully printed kitchen ticket to: ${printRes.printer_name}`);
        }
    },
});
