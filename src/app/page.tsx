
"use client";

import { useState } from "react";
import { Loader2, ServerCrash, Download, Trash2, FileJson, ListX, BarChart2, FileDown } from "lucide-react";
import { FileUploader } from "@/components/file-uploader";
import { GanttChart } from "@/components/gantt-chart";
import { ValidationErrors } from "@/components/validation-errors";
import { parseExcel } from "@/lib/excel-parser";
import { validateAndTransform } from "@/lib/validator";
import type { GanttHeat, ValidationError, ExcelRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SteelGanttVisionIcon } from "@/components/icons";
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface Stats {
    totalHeats: number;
    totalOperations: number;
    totalIdleMinutes: number;
    errorCount: number;
    warningCount: number;
}


export default function Home() {
  const [ganttData, setGanttData] = useState<GanttHeat[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [warnings, setWarnings] = useState<ValidationError[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ExcelRow[]>([]);
  const [cleanJson, setCleanJson] = useState<ExcelRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);


  const resetState = () => {
    setGanttData([]);
    setValidationErrors([]);
    setWarnings([]);
    setError(null);
    setPreviewData([]);
    setCleanJson([]);
    setStats(null);
  }

  const handleFileProcess = async (file: File) => {
    setIsLoading(true);
    resetState();

    try {
      const { rows: parsedRows, warnings: parseWarnings } = await parseExcel(file);
      setPreviewData(parsedRows.slice(0, 20));
      setCleanJson(parsedRows);

      const { validHeats, errors: validationErrs } = validateAndTransform(parsedRows);
      
      const allWarnings = [...parseWarnings, ...validationErrs.filter(e => e.kind === 'PLACEHOLDER' || e.kind === 'UNIT')];
      const allErrors = validationErrs.filter(e => e.kind !== 'PLACEHOLDER' && e.kind !== 'UNIT');

      setGanttData(validHeats);
      setValidationErrors(allErrors);
      setWarnings(allWarnings);

      // Calculate stats
      const totalIdle = validHeats.reduce((acc, heat) => 
        acc + heat.operations.reduce((opAcc, op) => opAcc + (op.idleTimeMinutes || 0), 0), 0);

      setStats({
          totalHeats: validHeats.length,
          totalOperations: validHeats.reduce((acc, heat) => acc + heat.operations.length, 0),
          totalIdleMinutes: Math.round(totalIdle),
          errorCount: allErrors.length,
          warningCount: allWarnings.length,
      });

    } catch (e: any) {
      console.error(e);
      setError(`Đã xảy ra lỗi: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const exportToJson = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(cleanJson, null, 2)
    )}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = "raw_clean.json";
    link.click();
  };

  const exportErrorsToCsv = () => {
    const csvRows = [
        ['Heat_ID', 'Kind', 'Unit', 'Message'],
        ...[...validationErrors, ...warnings].map(e => [e.heat_id, e.kind, e.unit || '', `"${e.message}"`])
    ];
    const csvString = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "error_log.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-10 flex items-center h-16 px-4 border-b bg-background/80 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
            <SteelGanttVisionIcon className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold tracking-tighter font-headline">
              Steel Gantt Vision
            </h1>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-1">
            <FileUploader onFileProcess={handleFileProcess} isLoading={isLoading} />
            <a href="/sample-data.xlsx" download="sample-data.xlsx">
              <Button variant="outline" className="w-full">
                <FileDown className="mr-2 h-4 w-4" /> Tải về tệp mẫu
              </Button>
            </a>

             {error && (
              <Card className="border-destructive">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <ServerCrash className="w-5 h-5" />
                    Lỗi Xử Lý Tệp
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-destructive-foreground">{error}</p>
                </CardContent>
              </Card>
            )}

            {previewData.length > 0 && (
                 <Card>
                    <CardHeader>
                        <CardTitle>Xem trước dữ liệu (20 dòng đầu)</CardTitle>
                        <CardDescription>Dữ liệu đã được chuẩn hóa từ file đã tải lên.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="max-h-60 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Heat ID</TableHead>
                                        <TableHead>Unit</TableHead>
                                        <TableHead>Start</TableHead>
                                        <TableHead>End</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {previewData.map((row) => (
                                        <TableRow key={row.rawIndex}>
                                            <TableCell>{row.heatId}</TableCell>
                                            <TableCell>{row.unit}</TableCell>
                                            <TableCell>{row.startStr}</TableCell>
                                            <TableCell>{row.endStr}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
            
            {stats && (
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 font-headline"><BarChart2 className="w-5 h-5" />Thống kê</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-sm">
                        <p>Tổng số mẻ: <span className="font-bold">{stats.totalHeats}</span></p>
                        <p>Tổng số công đoạn: <span className="font-bold">{stats.totalOperations}</span></p>
                        <p>Tổng thời gian chờ (phút): <span className="font-bold">{stats.totalIdleMinutes}</span></p>
                        <p>Số lỗi: <span className="font-bold text-destructive">{stats.errorCount}</span></p>
                        <p>Số cảnh báo: <span className="font-bold text-yellow-500">{stats.warningCount}</span></p>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-2 gap-2">
                <Button onClick={exportToJson} disabled={cleanJson.length === 0} variant="outline" className="w-full">
                    <Download className="mr-2 h-4 w-4" /> Export Clean JSON
                </Button>
                <Button onClick={exportErrorsToCsv} disabled={validationErrors.length === 0 && warnings.length === 0} variant="outline" className="w-full">
                    <ListX className="mr-2 h-4 w-4" /> Export Error Log
                </Button>
                 <Button onClick={resetState} variant="destructive" className="w-full col-span-2">
                    <Trash2 className="mr-2 h-4 w-4" /> Reset
                </Button>
            </div>

            <ValidationErrors errors={validationErrors} title="Lỗi nghiêm trọng" description="Các lỗi này ngăn cản việc hiển thị mẻ trên biểu đồ." />
            <ValidationErrors errors={warnings} title="Cảnh báo & Ghi chú" description="Các vấn đề này không chặn việc xử lý nhưng cần được xem xét." isWarning />
          
          </div>
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="font-headline">Biểu đồ Gantt</CardTitle>
              </CardHeader>
              <CardContent className="pl-0">
                {isLoading ? (
                  <div className="flex items-center justify-center h-[600px]">
                    <Loader2 className="w-12 h-12 animate-spin text-primary" />
                  </div>
                ) : ganttData.length > 0 ? (
                  <GanttChart data={ganttData} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-[600px] text-muted-foreground gap-4">
                    <FileJson className="w-16 h-16" />
                    <p className="text-center">Tải lên tệp Excel hoặc CSV để tạo biểu đồ Gantt.</p>
                     <p className="text-xs text-center max-w-sm">Hỗ trợ các cột: Date, Heat_ID, Steel_Grade, Unit, Start_Time, End_Time, sequence_number (tùy chọn).</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
