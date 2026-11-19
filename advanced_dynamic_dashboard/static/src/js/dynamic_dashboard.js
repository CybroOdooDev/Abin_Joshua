import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { DynamicDashboardTile } from './dynamic_dashboard_tile';
import { DynamicDashboardChart } from './dynamic_dashboard_chart';
import { useService } from "@web/core/utils/hooks";
import { Component, useRef, onMounted, useState } from "@odoo/owl";


export class AdvancedDynamicDashboard extends Component {
    static components = { DynamicDashboardTile, DynamicDashboardChart };
    static template = "owl.AdvancedDynamicDashboard";

    setup() {
        this.rootRef = useRef("root");
        this.themeSelectorRef = useRef("themeSelector");
        this.startDateRef = useRef("startDate");
        this.endDateRef = useRef("endDate");
        this.searchInputRef = useRef("searchInput");
        this.itemsRef = useRef("items");
        this.action = useService("action");
        this.orm = useService("orm");
        this.dialog = useService("dialog");
        this.rpc = useService("rpc");
        this.actionId = this.props.actionId;
        this.state = useState({
            isDarkMode: false,
            isEditingLayout: false,
            showModeText: false,
            blocks: [],
            themes: [],
        });
        onMounted(() => {
            this.renderDashboard();
        });
    }

    get interact() {
        return typeof window !== "undefined" && window.interact ? window.interact : null;
    }

    get modeLabel() {
        return this.state.isDarkMode ? _t("Light Mode") : _t("Dark Mode");
    }

    onChangeTheme() {
        const themeStyle = this.themeSelectorRef.el?.value || "";
        this.rootRef.el?.setAttribute('style', themeStyle + 'min-height:-webkit-fill-available;');
    }

    ResizeDrag() {
        const interactJs = this.interact;
        if (!interactJs) {
            return;
        }
        const elements = this.itemsRef.el ? this.itemsRef.el.querySelectorAll('.resize-drag') : [];
        elements.forEach((element) => {
            interactJs(element).resizable({
                edges: { left: true, right: true, bottom: true, top: true },
                listeners: {
                    move(event) {
                        const target = event.target;
                        let x = (parseFloat(target.getAttribute('data-x')) || 0);
                        let y = (parseFloat(target.getAttribute('data-y')) || 0);
                        target.style.width = event.rect.width + 'px';
                        target.style.height = event.rect.height + 'px';
                        x += event.deltaRect.left;
                        y += event.deltaRect.top;
                    }
                },
                modifiers: [
                    interactJs.modifiers.restrictEdges({
                        outer: 'parent'
                    }),
                    interactJs.modifiers.restrictSize({
                        min: { width: 100, height: 50 }
                    })
                ],
                inertia: true
            }).draggable({
                listeners: {
                    move(event) {
                        const target = event.target;
                        const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                        const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
                        target.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
                        target.setAttribute('data-x', x);
                        target.setAttribute('data-y', y);
                    }
                },
                inertia: true,
                modifiers: [
                    interactJs.modifiers.restrictRect({
                        restriction: 'parent',
                        endOnly: true
                    })
                ]
            });
        });
    }

    async renderDashboard() {
        const themes = await this.orm.call('dashboard.theme', 'get_records', [[]]);
        this.state.themes = themes;
        const blocks = await this.orm.call("dashboard.block", "get_dashboard_vals", [[], this.actionId]);
        this.state.blocks = blocks;
    }

    editLayout(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        const interactJs = this.interact;
        if (interactJs) {
            const elements = this.itemsRef.el ? this.itemsRef.el.querySelectorAll('.resize-drag') : [];
            elements.forEach((element) => {
                interactJs(element).draggable(true);
                interactJs(element).resizable(true);
            });
        }
        this.state.isEditingLayout = true;
        this.ResizeDrag();
    }

    saveLayout(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        this.state.isEditingLayout = false;
        const interactJs = this.interact;
        const data_list = [];
        const elements = this.itemsRef.el ? this.itemsRef.el.querySelectorAll('.resize-drag') : [];
        elements.forEach((element) => {
            if (interactJs) {
                interactJs(element).draggable(false);
                interactJs(element).resizable(false);
            }
            data_list.push({
                'id': element.dataset['id'],
                'data-x': element.dataset['x'],
                'data-y': element.dataset['y'],
                'height': element.clientHeight,
                'width': element.clientWidth,
            });
        });
        this.orm.call('dashboard.block', 'get_save_layout', [[], data_list]).then(() => {
            window.location.reload();
        });
    }

    changeViewMode(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        this.state.isDarkMode = !this.state.isDarkMode;
        const dashboard = this.rootRef.el;
        if (this.state.isDarkMode) {
            dashboard?.setAttribute('style', 'background-color: #383E45;min-height:-webkit-fill-available;');
        } else {
            const themeStyle = this.themeSelectorRef.el?.value || "";
            dashboard?.setAttribute('style', themeStyle + 'min-height:-webkit-fill-available;');
        }
    }

    onClickAddItem(event) {
        event.stopPropagation();
        event.preventDefault();
        const type = event.target.getAttribute('data-type');
        let chart_type = null;
        if (type == 'graph') {
            chart_type = event.target.getAttribute('data-chart_type');
        }
        if (type == 'tile') {
            const randomColor = '#' + ('000000' + Math.floor(Math.random() * 16777216).toString(16)).slice(-6);
            this.action.doAction({
                type: 'ir.actions.act_window',
                res_model: 'dashboard.block',
                view_mode: 'form',
                views: [[false, 'form']],
                context: {
                    'form_view_initial_mode': 'edit',
                    'default_name': _t('New Tile'),
                    'default_type': type,
                    'default_height': '155px',
                    'default_width': '300px',
                    'default_tile_color': randomColor,
                    'default_text_color': '#FFFFFF',
                    'default_val_color': '#F3F3F3',
                    'default_fa_icon': 'fa fa-bar-chart',
                    'default_client_action_id': parseInt(this.actionId)
                }
            });
        }
        else {
            const chartTitles = {
                bar: _t('New Bar Chart'),
                doughnut: _t('New Doughnut Chart'),
                line: _t('New Line Chart'),
                pie: _t('New Pie Chart'),
                polarArea: _t('New Polar Area Chart'),
                radar: _t('New Radar Chart'),
            };
            const defaultName = chartTitles[chart_type] || _t('New Chart');
            this.action.doAction({
                type: 'ir.actions.act_window',
                res_model: 'dashboard.block',
                view_mode: 'form',
                views: [[false, 'form']],
                context: {
                    'form_view_initial_mode': 'edit',
                    'default_name': defaultName,
                    'default_type': type,
                    'default_height': '565px',
                    'default_width': '588px',
                    'default_graph_type': chart_type,
                    'default_fa_icon': 'fa fa-bar-chart',
                    'default_client_action_id': parseInt(this.actionId)
                },
            });
        }
    }

    async dateFilter() {
        const start_date = this.startDateRef.el?.value || "null";
        const end_date = this.endDateRef.el?.value || "null";
        const blocks = await this.orm.call("dashboard.block", "get_dashboard_vals", [[], this.actionId, start_date, end_date]);
        this.state.blocks = blocks;
    }

    input_change() {
        const input = this.searchInputRef.el?.value || "";
        if (input === "") {
            this.clearSearch();
        }
    }

    async clickSearch() {
        const input = this.searchInputRef.el?.value || "";
        const response = await this.rpc('/custom_dashboard/search_input_chart', { 'search_input': input });
        const blocks = this.itemsRef.el ? this.itemsRef.el.querySelectorAll(".resize-drag") : [];
        blocks.forEach((element) => {
            const dataId = JSON.parse(element.getAttribute('data-id'));
            if (response.includes(dataId)) {
                element.style.visibility = "visible";
            } else {
                element.style.visibility = "hidden";
            }
        });
    }

    showViewMode() {
        this.state.showModeText = true;
    }

    hideViewMode() {
        this.state.showModeText = false;
    }

    clearSearch() {
        if (this.searchInputRef.el) {
            this.searchInputRef.el.value = '';
        }
        const blocks = this.itemsRef.el ? this.itemsRef.el.querySelectorAll(".resize-drag") : [];
        blocks.forEach((element) => {
            element.style.visibility = "visible";
        });
    }

    async printPdf() {
        const elements = this.itemsRef.el ? Array.from(this.itemsRef.el.querySelectorAll('.resize-drag')) : [];
        const newElement = document.createElement('div');
        newElement.className = 'pdf';
        elements.forEach((elem) => {
            newElement.appendChild(elem.cloneNode(true));
        });
        for (let x = 0; x < newElement.children.length; x++) {
            newElement.children[x].style.transform = "";
        }
        const opt = {
            margin: 0.3,
            filename: 'Dashboard.pdf',
            image: { type: 'jpeg', quality: 1 },
            html2canvas: { scale: 1 },
            jsPDF: { unit: 'mm', format: 'a3', orientation: 'portrait' }
        };
        const html2pdfLib = typeof window !== "undefined" && window.html2pdf ? window.html2pdf : null;
        if (html2pdfLib) {
            html2pdfLib().set(opt).from(newElement).save().then(() => {
                window.location.reload();
            });
        }
    }

    async createPDF() {
        const elements = this.itemsRef.el ? Array.from(this.itemsRef.el.querySelectorAll('.resize-drag')) : [];
        const newElement = document.createElement('div');
        newElement.className = 'pdf';
        elements.forEach((elem) => {
            newElement.appendChild(elem.cloneNode(true));
        });
        for (let x = 0; x < newElement.children.length; x++) {
            newElement.children[x].style.transform = "";
        }
        const opt = {
            margin: 0.3,
            filename: 'Dashboard.pdf',
            image: { type: 'jpeg', quality: 1 },
            html2canvas: { scale: 1 },
            jsPDF: { unit: 'mm', format: 'a3', orientation: 'portrait' }
        };
        const html2pdfLib = typeof window !== "undefined" && window.html2pdf ? window.html2pdf : null;
        if (html2pdfLib) {
            const pdf = html2pdfLib().set(opt).from(newElement).toPdf();
            const pdfOutput = await pdf.output('datauristring');
            return pdfOutput;
        }
        return '';
    }

    async sendMail() {
        const created_pdf = await this.createPDF();
        const base64code = created_pdf ? created_pdf.split(',')[1] : '';
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: _t('Send Mail'),
            res_model: 'dashboard.mail',
            view_mode: 'form',
            views: [[false, 'form']],
            target: 'new',
            context: {
                'default_base64code': base64code,
            }
        });
    }
}

registry.category("actions").add("AdvancedDynamicDashboard", AdvancedDynamicDashboard);
