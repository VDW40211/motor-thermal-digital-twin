'use client';

import { useMotorStore } from '@/store/motor-store';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileJson, FileSpreadsheet, FileText, Printer } from 'lucide-react';

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJSON() {
  const { nameplate, operating, losses, thermal, kpi, confidence, rootCauses } = useMotorStore.getState();
  const data = {
    exportDate: new Date().toISOString(),
    motor: nameplate,
    operatingConditions: operating,
    losses,
    thermalState: thermal,
    kpi,
    confidence,
    rootCauses,
    disclaimer: 'This is an estimation tool using lumped-parameter thermal modeling. Not a replacement for physical temperature measurement.',
  };
  downloadFile(JSON.stringify(data, null, 2), 'motor-thermal-report.json', 'application/json');
}

function exportCSV() {
  const { nameplate, operating, losses, thermal, kpi } = useMotorStore.getState();
  if (!losses || !thermal || !kpi) return;
  const rows = [
    ['Motor Thermal Digital Twin - Export'],
    [''],
    ['Nameplate Parameters'],
    ['Rated Power (kW)', nameplate.ratedPower],
    ['Rated Voltage (V)', nameplate.ratedVoltage],
    ['Rated Current (A)', nameplate.ratedCurrent],
    ['Rated Speed (RPM)', nameplate.ratedSpeed],
    ['Efficiency (%)', (nameplate.efficiency * 100).toFixed(1)],
    ['Insulation Class', nameplate.insulationClass],
    ['Enclosure', nameplate.enclosureType],
    [''],
    ['Operating Conditions'],
    ['Voltage (V)', operating.voltage],
    ['Current (A)', operating.current],
    ['Frequency (Hz)', operating.frequency],
    ['Speed (RPM)', operating.speed],
    ['Ambient (°C)', operating.ambientTemp],
    [''],
    ['Results'],
    ['Winding Temp (°C)', thermal.windingTemp.toFixed(1)],
    ['Frame Temp (°C)', thermal.frameTemp.toFixed(1)],
    ['Thermal Utilization (%)', (thermal.thermalUtilization * 100).toFixed(1)],
    ['Total Losses (W)', losses.totalLosses.toFixed(1)],
    ['Copper Loss (W)', losses.copperLoss.toFixed(1)],
    ['Core Loss (W)', losses.coreLoss.toFixed(1)],
    ['Mechanical Loss (W)', losses.mechanicalLoss.toFixed(1)],
    ['Stray Loss (W)', losses.strayLoadLoss.toFixed(1)],
    ['Health Score', kpi.healthScore],
    ['Load (%)', kpi.loadPercent.toFixed(1)],
    ['Time to Trip (min)', kpi.timeToTrip === Infinity ? 'N/A' : kpi.timeToTrip.toFixed(1)],
    ['Insulation Life Factor', kpi.insulationLifeFactor.toFixed(3)],
  ];
  const csv = rows.map(r => r.join(',')).join('\n');
  downloadFile(csv, 'motor-thermal-report.csv', 'text/csv');
}

function exportExcel() {
  const { nameplate, operating, losses, thermal, kpi } = useMotorStore.getState();
  if (!losses || !thermal || !kpi) return;

  // Simple XML Spreadsheet 2003 format (no library needed)
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#1e293b" ss:Pattern="Solid"/><Font ss:Color="#ffffff"/></Style>
  <Style ss:ID="value"><Font ss:Size="10"/></Style>
 </Styles>
 <Worksheet ss:Name="Motor Thermal Report">
  <Table>
   <Column ss:Width="200"/><Column ss:Width="150"/>
   <Row><Cell ss:StyleID="header"><Data ss:Type="String">Parameter</Data></Cell><Cell ss:StyleID="header"><Data ss:Type="String">Value</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Rated Power</Data></Cell><Cell><Data ss:Type="String">${nameplate.ratedPower} kW</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Winding Temperature</Data></Cell><Cell><Data ss:Type="String">${thermal.windingTemp.toFixed(1)} °C</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Frame Temperature</Data></Cell><Cell><Data ss:Type="String">${thermal.frameTemp.toFixed(1)} °C</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Thermal Utilization</Data></Cell><Cell><Data ss:Type="String">${(thermal.thermalUtilization * 100).toFixed(1)}%</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Total Losses</Data></Cell><Cell><Data ss:Type="String">${losses.totalLosses.toFixed(1)} W</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Health Score</Data></Cell><Cell><Data ss:Type="String">${kpi.healthScore}/100</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Load</Data></Cell><Cell><Data ss:Type="String">${kpi.loadPercent.toFixed(1)}%</Data></Cell></Row>
  </Table>
 </Worksheet>
</Workbook>`;
  downloadFile(xml, 'motor-thermal-report.xls', 'application/vnd.ms-excel');
}

function exportPrint() {
  window.print();
}

export default function ExportMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Download className="w-3.5 h-3.5" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={exportCSV} className="gap-2 text-xs">
          <FileText className="w-3.5 h-3.5" /> CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportJSON} className="gap-2 text-xs">
          <FileJson className="w-3.5 h-3.5" /> JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportExcel} className="gap-2 text-xs">
          <FileSpreadsheet className="w-3.5 h-3.5" /> Excel (XML)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportPrint} className="gap-2 text-xs">
          <Printer className="w-3.5 h-3.5" /> Print / PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}