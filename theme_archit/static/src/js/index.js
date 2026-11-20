import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

/**
 * ArchitSlider Widget
 *
 * Initializes and manages an owlCarousel slider for .owl-carousel elements.
 */
export class ArchitSlider extends Interaction {
    static selector = ".owl-carousel";

    setup() {
        if (!this.el || typeof $(this.el).owlCarousel !== "function") {
            return;
        }
        const self = this;
        $(this.el).owlCarousel({
            items: 1,
            loop: true,
            margin: 0,
            stagePadding: 0,
            smartSpeed: 450,
            autoplay: true,
            autoPlaySpeed: 1000,
            autoPlayTimeout: 1000,
            autoplayHoverPause: true,
            dots: true,
            nav: true,
            navText: [
                '<i class="fa fa-angle-left" aria-hidden="false"></i>',
                '<i class="fa fa-angle-right" aria-hidden="false"></i>',
            ],
            onInitialized: function () {
                var buttons = $(self.el).find(".owl-dots button");
                buttons.each(function (index, item) {
                    $(item).find("span").index + 1;
                });
            },
        });
    }

    destroy() {
        if (this.el && typeof $(this.el).owlCarousel === "function") {
            $(this.el).trigger("destroy.owl.carousel");
        }
        super.destroy();
    }
}

registry.category("public.interactions").add("theme_archit.slider", ArchitSlider);
