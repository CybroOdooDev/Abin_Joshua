/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { barcodeReaderService } from "@point_of_sale/app/barcode/barcode_reader_service";

patch(barcodeReaderService, {

    async start(env, deps) {

        const reader = await super.start(...arguments);

        if (reader) {

            reader.orm = deps.orm;
            reader.popup = deps.popup;
            reader.notification = deps.notification;
            reader.hardwareProxy = deps.hardware_proxy;

        }

        return reader;
    }

});