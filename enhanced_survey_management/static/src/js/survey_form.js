/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { rpc } from "@web/core/network/rpc";
import { SurveyForm } from "@survey/interactions/survey_form";

patch(SurveyForm.prototype, {
    start() {
        super.start();
        this.addListener(this.el, "focusin", (ev) => {
            if (ev.target.matches(".o_select_Country")) {
                this._onSelectCountry(ev);
            }
        });
        this.addListener(this.el, "change", (ev) => {
            if (ev.target.matches(".o_select_Country")) {
                this._onSelectState(ev);
            } else if (ev.target.matches(".o_select_many2many")) {
                this._onSelectMany2many(ev);
            }
        });
    },

    _onSelectCountry(ev) {
        const select = ev.target;
        rpc("/survey/load_country").then((result) => {
            select.innerHTML = `<option value="">Country</option>`;
            if (result && result.id) {
                result.id.forEach((_, i) => {
                    select.insertAdjacentHTML(
                        "beforeend",
                        `<option value="${result.name[i]}">${result.name[i]}</option>`
                    );
                });
            }
        });
    },

    _onSelectState(ev) {
        const country = ev.target.value;
        const qid = ev.target.dataset.id;

        rpc("/survey/load_states", {
            country_id: country,
        }).then((result) => {
            const stateSelect = this.el.querySelector(
                `#${CSS.escape(`${qid}-state`)}`
            );
            if (!stateSelect) {
                return;
            }

            stateSelect.innerHTML = `<option value="">State</option>`;
            if (result && result.id) {
                result.id.forEach((_, i) => {
                    stateSelect.insertAdjacentHTML(
                        "beforeend",
                        `<option value="${result.name[i]}">${result.name[i]}</option>`
                    );
                });
            }
        });
    },

    _onSelectMany2many() {
        const target = this.el.querySelector(".o_select_many2many_text");
        const source = this.el.querySelector(".o_select_many2many");
        if (target && source) {
            target.value = source.value;
        }
    },
});
