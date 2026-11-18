/** @odoo-module */

import { Component, useProps, proxy, t } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";

export class HotelRoomPopup extends Component {
    static template = "hotel_pos_extension.HotelRoomPopup";
    static components = { Dialog };
    props = useProps({
        title: t.string().optional(),
        bookings: t.array().optional([]),
        getPayload: t.function().optional(),
        close: t.function().optional(),
    });

    setup() {
        this.state = proxy({
            selectedBooking: this.props.bookings?.[0] || null,
        });
    }

    onBookingChange(ev) {
        const bookingId = parseInt(ev.target.value, 10);
        this.state.selectedBooking = this.props.bookings.find((b) => b.id === bookingId) || null;
    }

    confirm() {
        if (this.props.getPayload) {
            this.props.getPayload(this.state.selectedBooking);
        }
        if (this.props.close) {
            this.props.close();
        }
    }

    cancel() {
        if (this.props.close) {
            this.props.close();
        }
    }
}
