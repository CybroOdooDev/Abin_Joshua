import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { DynamicDashboardTile } from './dynamic_dashboard_tile';
import { DynamicDashboardChart } from './dynamic_dashboard_chart';
import { useService } from "@web/core/utils/hooks";
import { Component, signal, onMounted, useState } from "@odoo/owl";


export class AdvancedDynamicDashboard extends Component {
    static components = { DynamicDashboardTile, DynamicDashboardChart };
    static template = "owl.AdvancedDynamicDashboard";

    // Setup function to run when the template of the class AdvancedDynamicDashboard renders
    setup() {
        this.ThemeSelector = signal.ref();
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
        });
        onMounted(() => {
            this.renderDashboard();
        });
    }

    onChangeTheme() {
        /* Function for changing color of the theme of the dashboard */
        document.querySelector(".o_advanced_dynamic_dashboard")?.setAttribute('style', (this.ThemeSelector()?.value || "") + 'min-height:-webkit-fill-available;')
    }

    ResizeDrag() {
        /* Function for resizing and dragging the div resize-drag */
        const interactJs = window.interact || interact;
        if (!interactJs) return;
        document.querySelectorAll('.items .resize-drag').forEach((element) => {
            interactJs(element).resizable({
                edges: { left: true, right: true, bottom: true, top: true },
                listeners: {
                    move(event) {
                        const target = event.target;
                        let x = (parseFloat(target.getAttribute('data-x')) || 0);
                        let y = (parseFloat(target.getAttribute('data-y')) || 0);
                        // update the element's style
                        target.style.width = event.rect.width + 'px';
                        target.style.height = event.rect.height + 'px';
                        // translate when resizing from top or left edges
                        x += event.deltaRect.left;
                        y += event.deltaRect.top;
                    }
                },
                modifiers: [
                    // keep the edges inside the parent
                    interactJs.modifiers.restrictEdges({
                        outer: 'parent'
                    }),
                    // minimum size
                    interactJs.modifiers.restrictSize({
                        min: { width: 100, height: 50 }
                    })
                ],
                inertia: true
            }).draggable({
                listeners: {
                    move(event) {
                        const target = event.target;
                        // keep the dragged position in the data-x/data-y attributes
                        const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                        const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
                        // translate the element
                        target.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
                        // update the position attributes
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
        /* Function for rendering the dashboard */
        await this.orm.call('dashboard.theme', 'get_records', [[]]).then((response) => {
            response.forEach((ev) => {
                const options = document.createElement("option");
                options.value = ev.style;
                options.text = ev.name;
                this.ThemeSelector()?.append(options);
            });
        });
        const blocks = await this.orm.call("dashboard.block", "get_dashboard_vals", [[], this.actionId]);
        this.state.blocks = blocks;
    }

    editLayout(ev) {
        /* Function for editing the layout , it enables resizing and dragging functionality */
        const interactJs = window.interact || interact;
        if (interactJs) {
            document.querySelectorAll('.resize-drag').forEach((element) => {
                interactJs(element).draggable(true);
                interactJs(element).resizable(true);
            });
        }
        ev.stopPropagation();
        ev.preventDefault();
        this.state.isEditingLayout = true;
        this.ResizeDrag();
    }

    saveLayout(ev) {
        /* Function for saving the layout */
        ev.stopPropagation();
        ev.preventDefault();
        this.state.isEditingLayout = false;
        const interactJs = window.interact || interact;
        const data_list = [];
        document.querySelectorAll('.resize-drag').forEach((element) => {
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
        /* Function for changing the mode of the view */
        ev.stopPropagation();
        ev.preventDefault();
        this.state.isDarkMode = !this.state.isDarkMode;
        const dashboard = document.querySelector(".o_advanced_dynamic_dashboard");
        if (this.state.isDarkMode) {
            dashboard?.setAttribute('style', 'background-color: #383E45;min-height:-webkit-fill-available;');
        } else {
            dashboard?.setAttribute('style', (this.ThemeSelector()?.value || "") + 'min-height:-webkit-fill-available;');
        }
    }

    onClickAddItem(event) {
        /* Function for adding tiles and charts */
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
                    'default_name': 'New Tile',
                    'default_type': type,
                    'default_height': '155px',
                    'default_width': '300px',
                    'default_tile_color': randomColor,
                    'default_text_color': '#FFFFFF',
                    'default_val_color': '#F3F3F3',
                    'default_fa_icon': 'fa fa-bar-chart',
                    'default_client_action_id': parseInt(this.actionId)
                }
            })
        }
        else {
            this.action.doAction({
                type: 'ir.actions.act_window',
                res_model: 'dashboard.block',
                view_mode: 'form',
                views: [[false, 'form']],
                context: {
                    'form_view_initial_mode': 'edit',
                    'default_name': 'New ' + (chart_type || 'Chart'),
                    'default_type': type,
                    'default_height': '565px',
                    'default_width': '588px',
                    'default_graph_type': chart_type,
                    'default_fa_icon': 'fa fa-bar-chart',
                    'default_client_action_id': parseInt(this.actionId)
                },
            })
        }
    }

    async dateFilter() {
        /* Function for filtering the data based on the creation date */
        const start_date = document.getElementById("start-date")?.value || "null";
        const end_date = document.getElementById("end-date")?.value || "null";
        const blocks = await this.orm.call("dashboard.block", "get_dashboard_vals", [[], this.actionId, start_date, end_date]);
        this.state.blocks = blocks;
    }

    input_change() {
        const input = document.getElementById("search-input-chart").value;
        input === '' && this.clearSearch()
    }

    async clickSearch() {
        /* Function for searching the blocks with their names */
        const input = document.getElementById("search-input-chart").value;
        this.rpc('/custom_dashboard/search_input_chart', { 'search_input': input }).then((response) => {
            const blocks = document.querySelectorAll(".items .resize-drag");
            blocks.forEach((element) => {
                const dataId = JSON.parse(element.getAttribute('data-id'));
                if (response.includes(dataId)) {
                    element.style.visibility = "visible";
                }
                else {
                    element.style.visibility = "hidden";
                }
            });
        });
    }

    showViewMode(ev) {
        /* Function for showing the mode text */
        this.state.showModeText = true;
    }

    hideViewMode(ev) {
        /* Function for hiding the mode text */
        this.state.showModeText = false;
    }
    clearSearch() {
        /* Function for clearing the search input */
        document.getElementById("search-input-chart").value = '';
        const blocks = document.querySelectorAll(".items .resize-drag");
        blocks.forEach((element) => {
            element.style.visibility = "visible";
        });
    }

    async printPdf() {
        /* Function for printing whole dashboard in pdf format */
        const elements = document.querySelectorAll('.items,.resize-drag');
        const newElement = document.createElement('div');
        newElement.className = 'pdf';
        elements.forEach((elem) => {
            newElement.appendChild(elem);
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
        const html2pdfLib = window.html2pdf || (typeof html2pdf !== "undefined" ? html2pdf : null);
        if (html2pdfLib) {
            html2pdfLib().set(opt).from(newElement).save().then(() => {
                window.location.reload();
            });
        }
    }

    async createPDF() {
        /* Function for getting pdf data in string format */
        const elements = document.querySelectorAll('.items,.resize-drag');
        const newElement = document.createElement('div');
        newElement.className = 'pdf';
        elements.forEach((elem) => {
            newElement.appendChild(elem);
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
        const html2pdfLib = window.html2pdf || (typeof html2pdf !== "undefined" ? html2pdf : null);
        if (html2pdfLib) {
            const pdf = html2pdfLib().set(opt).from(newElement).toPdf();
            const pdfOutput = await pdf.output('datauristring');
            return pdfOutput;
        }
        return '';
    }

    async sendMail() {
        /* Function for creating pdf and sending mail to the selected users */
        /* This function calls the createPDF() function and returns the pdf datas */
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
