/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { qzPrinterService } from "./QZPrinterService";
import { renderToElement } from "@web/core/utils/render";
import { _t } from "@web/core/l10n/translation";
import { captureThermalReceipt } from "./ThermalReceiptHelper";

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

        const rawOrderName = typeof order.get_name === "function" ? order.get_name() : (order.tracking_number || order.name || "");
        const orderName = rawOrderName.replace(/^Order\s*/i, "");
        const cashierName = this.get_cashier ? this.get_cashier().name : (this.user ? this.user.name : "");

        // 3. Group new lines by Course / Plating Level
        const courseMap = new Map();
        const defaultCourseKey = "general";
        const defaultCourseName = this.config.module_pos_restaurant ? _t("Dishes") : _t("Order");

        for (const change of (changes.new || [])) {
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

            const productName = line && typeof line._get_kitchen_product_name === "function"
                ? line._get_kitchen_product_name()
                : change.name;

            const comboParentName = line && line.comboParent
                ? (typeof line.comboParent._get_kitchen_product_name === "function"
                    ? line.comboParent._get_kitchen_product_name()
                    : (line.comboParent.product?.display_name || line.comboParent.get_product?.()?.display_name || ""))
                : "";

            courseMap.get(courseKey).lines.push({
                name: productName,
                qty: change.quantity,
                note: change.note || (line ? line.note : "") || "",
                comboParentName: comboParentName,
                isPartOfCombo: Boolean(change.isPartOfCombo),
            });
        }

        // Sort courses by sequence
        const sortedCourses = Array.from(courseMap.values()).sort((a, b) => a.sequence - b.sequence);

        const cancelledLines = (changes.cancelled || []).map((c) => {
            let comboParentName = "";
            if (c.line_uuid) {
                const prevLine = order.orderlines.find((l) => l.uuid === c.line_uuid);
                if (prevLine?.comboParent) {
                    comboParentName = typeof prevLine.comboParent._get_kitchen_product_name === "function"
                        ? prevLine.comboParent._get_kitchen_product_name()
                        : (prevLine.comboParent.product?.display_name || prevLine.comboParent.get_product?.()?.display_name || "");
                }
            }
            return {
                name: c.name,
                qty: c.quantity,
                note: c.note || "",
                comboParentName: comboParentName,
            };
        });

        if (sortedCourses.length === 0 && cancelledLines.length === 0) {
            console.log("[Kitchen Printing] No food items to print in kitchen ticket.");
            return;
        }

        const hasSentBefore = Boolean(
            (order.kitchen_print_count && order.kitchen_print_count > 0) ||
            (order.last_order_preparation_change && order.last_order_preparation_change !== "{}" && order.server_id)
        );

        const isUpdate = Boolean(hasCancelled || hasSentBefore);

        const kitchenData = {
            headerTitle: _t("*** KITCHEN ***"),
            orderName: orderName,
            tableName: tableName,
            floorName: floorName,
            orderType: order.take_away ? _t("TAKEAWAY") : _t("DINE IN"),
            cashierName: cashierName,
            diners: order.customer_count || null,
            time: timeStr,
            date: dateStr,
            courses: sortedCourses,
            cancelledLines: cancelledLines,
            hasCancelled: hasCancelled,
            hasNew: hasNew,
            isUpdate: isUpdate,
            newSectionTitle: _t("*** NEW ***"),
            cancelledSectionTitle: _t("*** CANCELLED ***"),
            sentToKitchenLabel: _t("SENT TO KITCHEN"),
            tableLabel: _t("TABLE:"),
            orderLabel: _t("ORDER:"),
            waiterLabel: _t("WAITER:"),
            noteLabel: _t("NOTE:"),
            paxLabel: _t("PAX:"),
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
            imageBase64 = await captureThermalReceipt(receiptEl);
        }

        if (!imageBase64) {
            console.warn("Failed to generate kitchen ticket raster image.");
            return;
        }

        const config = this.config;
        const kitchenPrinterName = (config.qz_kitchen_printer_id && config.qz_kitchen_printer_id[1])
            || (config.qz_kitchen_printer_name ? config.qz_kitchen_printer_name.trim() : null)
            || (config.qz_printer_id && config.qz_printer_id[1])
            || (config.qz_printer_name ? config.qz_printer_name.trim() : null);

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

        // 7. Track that this order has completed a kitchen print, so subsequent prints on this order are updates
        order.kitchen_print_count = (order.kitchen_print_count || 0) + 1;
    },

    async transferTable(table) {
        const orderToTransfer = this.orderToTransfer;
        let oldTableName = "";
        let oldTableId = null;
        if (orderToTransfer) {
            oldTableId = orderToTransfer.tableId;
            const oldTable = this.tables_by_id[oldTableId] || (orderToTransfer.getTable && orderToTransfer.getTable());
            oldTableName = oldTable ? oldTable.name : (orderToTransfer.table ? orderToTransfer.table.name : "");
        }
        const newTableName = table ? table.name : "";

        await super.transferTable(table);

        if (orderToTransfer && oldTableId && table && oldTableId !== table.id) {
            // 1. Sync table change to server immediately
            orderToTransfer.save_to_db();
            this.ordersToUpdateSet.add(orderToTransfer);
            try {
                await this.sendDraftToServer();
            } catch (err) {
                console.warn("Could not sync transferred table order to server:", err);
            }

            // 2. Notify kitchen display in real time
            try {
                await this.orm.call("pos.order", "handle_table_transfer_kds", [
                    orderToTransfer.server_id || orderToTransfer.backendId || 0,
                    oldTableId,
                    table.id,
                    oldTableName,
                    newTableName,
                    orderToTransfer.export_as_JSON ? orderToTransfer.export_as_JSON() : null,
                ]);
            } catch (kdsErr) {
                console.warn("Could not notify kitchen display of table transfer:", kdsErr);
            }

            // 3. Print table transfer kitchen ticket (if kitchen printing is enabled & order was sent to kitchen)
            const hasSentToKitchen = Boolean(
                orderToTransfer.send_to_kitchen ||
                (orderToTransfer.kitchen_print_count && orderToTransfer.kitchen_print_count > 0) ||
                (orderToTransfer.lastOrderPrepaChange && Object.keys(orderToTransfer.lastOrderPrepaChange).length > 0) ||
                (orderToTransfer.last_order_preparation_change && orderToTransfer.last_order_preparation_change !== "{}")
            );

            if (this.config.enable_network_printing && this.config.enable_kitchen_printing && hasSentToKitchen) {
                try {
                    await this.printKitchenTableTransfer(orderToTransfer, oldTableName, newTableName);
                } catch (printErr) {
                    console.error("Error printing kitchen table transfer ticket:", printErr);
                }
            }
        }
    },

    async printKitchenTableTransfer(order, oldTableName, newTableName) {
        if (!order) return;

        const activeLines = order.orderlines.filter((l) => l.get_quantity() > 0);
        if (!activeLines || activeLines.length === 0) {
            return;
        }

        const now = new Date();
        const pad = (n) => (n < 10 ? "0" + n : n);
        const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

        const rawOrderName = typeof order.get_name === "function" ? order.get_name() : (order.tracking_number || order.name || "");
        const orderName = rawOrderName.replace(/^Order\s*/i, "");
        const cashierName = this.get_cashier ? this.get_cashier().name : (this.user ? this.user.name : "");
        const floorName = order.table && order.table.floor
            ? order.table.floor.name
            : (order.getTable && order.getTable()?.floor ? (order.getTable().floor.name || "") : "");

        const courseMap = new Map();
        const defaultCourseKey = "general";
        const defaultCourseName = this.config.module_pos_restaurant ? _t("Dishes") : _t("Order");

        for (const line of activeLines) {
            const platingLevel = typeof line.get_plating_level === "function" ? line.get_plating_level() : null;
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

            const productName = typeof line._get_kitchen_product_name === "function"
                ? line._get_kitchen_product_name()
                : (line.get_product ? line.get_product().display_name : (line.product?.display_name || ""));

            const comboParentName = line.comboParent
                ? (typeof line.comboParent._get_kitchen_product_name === "function"
                    ? line.comboParent._get_kitchen_product_name()
                    : (line.comboParent.product?.display_name || line.comboParent.get_product?.()?.display_name || ""))
                : "";

            courseMap.get(courseKey).lines.push({
                name: productName,
                qty: line.get_quantity(),
                note: (typeof line.getNote === "function" ? line.getNote() : line.note) || "",
                comboParentName: comboParentName,
                isPartOfCombo: Boolean(line.comboParent || (line.comboLines && line.comboLines.length > 0)),
            });
        }

        const sortedCourses = Array.from(courseMap.values()).sort((a, b) => a.sequence - b.sequence);
        if (sortedCourses.length === 0) {
            return;
        }

        const kitchenData = {
            headerTitle: _t("*** KITCHEN ***"),
            isTableTransfer: true,
            oldTableName: oldTableName,
            newTableName: newTableName,
            tableName: newTableName,
            floorName: floorName,
            orderName: orderName,
            orderType: order.take_away ? _t("TAKEAWAY") : _t("DINE IN"),
            cashierName: cashierName,
            diners: order.customer_count || null,
            time: timeStr,
            date: dateStr,
            courses: sortedCourses,
            cancelledLines: [],
            hasCancelled: false,
            hasNew: false,
            isUpdate: false,
            transferTitle: _t("TABLE TRANSFERRED"),
            sentToKitchenLabel: _t("TABLE TRANSFER SENT TO KITCHEN"),
            tableLabel: _t("TABLE:"),
            orderLabel: _t("ORDER:"),
            waiterLabel: _t("WAITER:"),
            noteLabel: _t("NOTE:"),
            paxLabel: _t("PAX:"),
        };

        let imageBase64 = null;
        let receiptEl = null;

        try {
            receiptEl = renderToElement("pos_network_printer.KitchenOrderReceipt", { data: kitchenData });
        } catch (err) {
            console.error("Failed to render kitchen table transfer ticket template:", err);
            return;
        }

        if (receiptEl) {
            imageBase64 = await captureThermalReceipt(receiptEl);
        }

        if (!imageBase64) {
            console.warn("Failed to generate kitchen table transfer raster image.");
            return;
        }

        const config = this.config;
        const kitchenPrinterName = (config.qz_kitchen_printer_id && config.qz_kitchen_printer_id[1])
            || (config.qz_kitchen_printer_name ? config.qz_kitchen_printer_name.trim() : null)
            || (config.qz_printer_id && config.qz_printer_id[1])
            || (config.qz_printer_name ? config.qz_printer_name.trim() : null);

        const customSnapshotName = `${orderName} (Transfer ${oldTableName} -> ${newTableName})`;
        try {
            await this.orm.call("pos.order", "log_printed_ticket", [
                order.server_id || false,
                imageBase64,
                "kitchen",
                kitchenPrinterName || "Kitchen Printer",
                "success",
                false,
                customSnapshotName,
            ]);
        } catch (e) {
            console.warn("Could not log kitchen transfer ticket snapshot in backend:", e);
        }

        if (this.config.simulation_mode) {
            console.log(`[Simulation Mode] Kitchen table transfer ticket for ${orderName} recorded without physical printing.`);
            if (this.env?.services?.notification) {
                this.env.services.notification.add(
                    _t("Kitchen transfer ticket saved in history (Simulation Mode: %s ➔ %s)", oldTableName, newTableName),
                    { type: "info" }
                );
            }
        } else {
            console.log(`[Kitchen Printing] Dispatching kitchen transfer ticket for ${orderName} to printer: ${kitchenPrinterName || "Default"}`);
            const printRes = await qzPrinterService.printReceiptImage(imageBase64, kitchenPrinterName);
            console.log(`[Kitchen Printing] Successfully printed kitchen transfer ticket to: ${printRes.printer_name}`);
        }
    },
});
