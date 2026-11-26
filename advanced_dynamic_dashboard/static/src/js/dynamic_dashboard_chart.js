import { loadBundle } from '@web/core/assets';
import { getColor } from "@web/core/colors/colors";
import { _t } from "@web/core/l10n/translation";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { Component, xml, onWillStart, onMounted, onPatched, onWillUnmount, signal } from "@odoo/owl";

export class DynamicDashboardChart extends Component {
    static template = xml`
        <div class="resize-drag block card"
            t-att-data-x="this.props.widget.data_x"
            t-att-data-y="this.props.widget.data_y"
            t-att-style="'height:'+this.props.widget.height+'; width:'+ this.props.widget.width+ '; transform: translate('+ this.props.widget.translate_x +', '+ this.props.widget.translate_y +');'"
            t-att-data-id="this.props.widget.id">
            <div class="card-body mt-1" id="in_ex_body_hide" style="background-color: #f0f4f7;">

                <div class="block_edit block_setting" t-on-click="(ev) => this.getConfiguration(ev)">
                    <i title="Configuration"
                        class="fa fa-pencil block_setting chart-edit"/>
                </div>

                <div class="block_edit block_image" data-type="png" t-on-click="(ev) => this.exportItem(ev)">
                    <i title="Save As Image" data-type="png"
                        class="bi bi-image block_image chart-image"/>
                </div>

                <div class="block_edit block_pdf" data-type="pdf" t-on-click="(ev) => this.exportItem(ev)">
                    <i title="Export to PDF" data-type="pdf"
                        class="bi bi-file-earmark-pdf block_pdf chart-pdf"/>
                </div>

                <div class="block_edit block_csv" t-att-data-id="this.props.widget.id" data-type="csv" t-on-click="(ev) => this.exportItem(ev)">
                    <i title="Export to CSV" data-type="csv" t-att-data-id="this.props.widget.id"
                        class="bi bi-filetype-csv block_csv chart-csv"/>
                </div>

                <div class="block_edit block_xlsx" t-att-data-id="this.props.widget.id" data-type="xlsx" t-on-click="(ev) => this.exportItem(ev)">
                    <i title="Export to XLSX" data-type="xlsx" t-att-data-id="this.props.widget.id"
                        class="fa fa-file-excel-o block_xlsx chart-xlsx"/>
                </div>

                <div class="block_edit block_delete" t-on-click="(ev) => this.removeTile(ev)">
                    <i title="Delete"
                        class="fa fa-times block_delete chart-setting"/>
                </div>
                <h3 class="chart_title">
                    <t t-out="this.props.widget.name"/>
                </h3>
                <div class="row-class">
                    <div class="col-md-12 chart_canvas" id="chart_canvas"
                        t-att-data-id="this.props.widget.id">
                        <canvas id="canvas" t-ref="this.chartRef" t-att-data-title="this.props.widget.name"/>
                    </div>
                </div>
            </div>
        </div>`;

    setup() {
        this.doAction = this.props.doAction.doAction;
        this.chartRef = signal.ref();
        this.chartInstance = null;
        this.dialog = this.props.dialog;
        onWillStart(async () => {
            await loadBundle("web.chartjs_lib");
        });
        onMounted(() => this.renderChart());
        onPatched(() => this.renderChart());
        onWillUnmount(() => this.destroyChart());
    }

    exportItem(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        const type = ev.currentTarget.getAttribute('data-type');
        const canvas = this.chartRef();
        if (!canvas) {
            return;
        }
        const dataTitle = canvas.getAttribute('data-title') || "Chart";
        const bgCanvas = document.createElement("canvas");
        bgCanvas.width = canvas.width;
        bgCanvas.height = canvas.height;
        const bgCtx = bgCanvas.getContext("2d");
        bgCtx.fillStyle = "white";
        bgCtx.fillRect(0, 0, canvas.width, canvas.height);
        bgCtx.drawImage(canvas, 0, 0);
        const imgData = bgCanvas.toDataURL("image/png");

        if (type === 'png') {
            const downloadLink = document.createElement('a');
            downloadLink.href = imgData;
            downloadLink.download = `${dataTitle}.png`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        }
        if (type === 'pdf') {
            const jsPDFLib = typeof window !== "undefined" && window.jsPDF ? window.jsPDF : (typeof jsPDF !== "undefined" ? jsPDF : null);
            if (jsPDFLib) {
                const pdf = new jsPDFLib();
                pdf.addImage(imgData, 'PNG', 0, 0);
                pdf.save(`${dataTitle}.pdf`);
            }
        }
        if (type === 'xlsx') {
            const rows = [this.props.widget.x_axis || [], this.props.widget.y_axis || []];
            const excelJSLib = typeof window !== "undefined" && window.ExcelJS ? window.ExcelJS : (typeof ExcelJS !== "undefined" ? ExcelJS : null);
            if (excelJSLib) {
                const workbook = new excelJSLib.Workbook();
                const worksheet = workbook.addWorksheet('My Sheet');
                for (let i = 0; i < rows.length; i++) {
                    worksheet.addRow(rows[i]);
                }
                const image = workbook.addImage({
                    base64: imgData,
                    extension: 'png',
                });
                worksheet.addImage(image, {
                    tl: { col: 0, row: 4 },
                    ext: { width: canvas.width, height: canvas.height }
                });
                workbook.xlsx.writeBuffer()
                .then((buffer) => {
                    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                    const link = document.createElement('a');
                    link.href = window.URL.createObjectURL(blob);
                    link.setAttribute("download", `${dataTitle}.xlsx`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                });
            }
        }
        if (type === 'csv') {
            const rows = [this.props.widget.x_axis || [], this.props.widget.y_axis || []];
            let csvContent = "data:text/csv;charset=utf-8,";
            rows.forEach((rowArray) => {
                const row = rowArray.join(",");
                csvContent += row + "\r\n";
            });
            const link = document.createElement("a");
            link.setAttribute("href", encodeURI(csvContent));
            link.setAttribute("download", `${dataTitle}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    async getConfiguration(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        const id = this.props.widget.id;
        await this.doAction({
            type: 'ir.actions.act_window',
            res_model: 'dashboard.block',
            res_id: id,
            view_mode: 'form',
            views: [[false, "form"]]
        });
    }

    async removeTile(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        this.dialog.add(ConfirmationDialog, {
            title: _t("Delete Confirmation"),
            body: _t("Are you sure you want to delete this item?"),
            confirmLabel: _t("Yes, I'm sure"),
            cancelLabel: _t("No, go back"),
            confirm: async () => {
                await this.props.orm.unlink("dashboard.block", [this.props.widget.id]);
                location.reload();
            },
            cancel: () => {},
        });
    }

    destroyChart() {
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
    }

    renderChart() {
        this.destroyChart();
        const canvas = this.chartRef();
        if (this.props.widget.graph_type && canvas) {
            const x_axis = this.props.widget.x_axis || [];
            const y_axis = this.props.widget.y_axis || [];
            const data = [];
            for (let i = 0; i < x_axis.length; i++) {
                data.push({ key: x_axis[i], value: y_axis[i] });
            }
            this.chartInstance = new Chart(
                canvas,
                {
                    type: this.props.widget.graph_type || 'bar',
                    data: {
                        labels: data.map(row => row.key),
                        datasets: [
                            {
                                label: this.props.widget.measured_field || 'Data',
                                data: data.map(row => row.value),
                                backgroundColor: data.map((_, index) => getColor(index)),
                                hoverOffset: 4
                            }
                        ]
                    },
                }
            );
        }
    }
}
