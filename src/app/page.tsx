
"use client";

import { useState } from "react";
import { Loader2, ServerCrash, Download, Trash2, FileJson, ListX, BarChart2, FileDown, CalendarIcon, Timer, Hourglass } from "lucide-react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, isSameDay, startOfDay } from 'date-fns';
import { vi } from 'date-fns/locale';

interface Stats {
    totalHeats: number;
    totalOperations: number;
    totalIdleMinutes: number;
    errorCount: number;
    warningCount: number;
}

export type TimeRange = 8 | 12 | 24 | 48;

export default function Home() {
  const [allGanttData, setAllGanttData] = useState<GanttHeat[]>([]);
  const [filteredGanttData, setFilteredGanttData] = useState<GanttHeat[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [warnings, setWarnings] = useState<ValidationError[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ExcelRow[]>([]);
  const [cleanJson, setCleanJson] = useState<ExcelRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>(24);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [availableDates, setAvailableDates] = useState<Date[]>([]);


  const resetState = () => {
    setAllGanttData([]);
    setFilteredGanttData([]);
    setValidationErrors([]);
    setWarnings([]);
    setError(null);
    setPreviewData([]);
    setCleanJson([]);
    setStats(null);
    setSelectedDate(new Date());
    setAvailableDates([]);
  }

  const filterDataByDate = (date: Date | undefined, data: GanttHeat[]) => {
      if (!date) {
        setFilteredGanttData(data);
        return;
      }
      const dayStart = startOfDay(date);
      const filtered = data.filter(heat => 
          heat.operations.some(op => isSameDay(op.startTime, dayStart))
      );
      setFilteredGanttData(filtered);
      updateStats(filtered, validationErrors, warnings);
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    filterDataByDate(date, allGanttData);
  }

  const updateStats = (heats: GanttHeat[], errors: ValidationError[], warnings: ValidationError[]) => {
       const totalIdle = heats.reduce((acc, heat) => acc + heat.totalIdleTime, 0);

      setStats({
          totalHeats: heats.length,
          totalOperations: heats.reduce((acc, heat) => acc + heat.operations.length, 0),
          totalIdleMinutes: Math.round(totalIdle),
          errorCount: errors.length,
          warningCount: warnings.length,
      });
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
      
      setAllGanttData(validHeats);
      setValidationErrors(allErrors);
      setWarnings(allWarnings);

      const dates = [...new Set(validHeats.flatMap(h => h.operations.map(op => startOfDay(op.startTime).getTime())))].map(t => new Date(t));
      setAvailableDates(dates);
      
      const initialDate = dates.length > 0 ? dates[0] : new Date();
      setSelectedDate(initialDate);
      filterDataByDate(initialDate, validHeats);


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
    <div className="flex flex-col min-h-screen bg-muted/20">
      <header className="sticky top-0 z-20 flex items-center h-16 px-4 border-b bg-background/80 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
            <SteelGanttVisionIcon className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold tracking-tighter font-headline">
              Steel Gantt Vision
            </h1>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="grid gap-6 xl:grid-cols-4">
          <div className="flex flex-col gap-6 xl:col-span-1">
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
                        <CardTitle className="flex items-center gap-2 font-headline"><BarChart2 className="w-5 h-5" />Thống kê cho ngày {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : ''}</CardTitle>
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
          <div className="xl:col-span-3 flex flex-col gap-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <CardTitle className="font-headline">Biểu đồ Gantt</CardTitle>
                    <div className="flex items-center gap-2">
                         <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                variant={"outline"}
                                className="w-[240px] justify-start text-left font-normal"
                                disabled={availableDates.length === 0}
                                >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {selectedDate ? format(selectedDate, "PPP", { locale: vi }) : <span>Chọn ngày</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={selectedDate}
                                    onSelect={handleDateSelect}
                                    initialFocus
                                    modifiers={{ available: availableDates }}
                                    modifiersClassNames={{ available: 'bg-primary/20' }}
                                />
                            </PopoverContent>
                        </Popover>

                        <ToggleGroup 
                            type="single" 
                            value={String(timeRange)}
                            onValueChange={(value) => {
                                if (value) setTimeRange(Number(value) as TimeRange);
                            }}
                            aria-label="Select time range"
                        >
                            <ToggleGroupItem value="8" aria-label="8 hours">8h</ToggleGroupItem>
                            <ToggleGroupItem value="12" aria-label="12 hours">12h</ToggleGroupItem>
                            <ToggleGroupItem value="24" aria-label="24 hours">24h</ToggleGroupItem>
                            <ToggleGroupItem value="48" aria-label="48 hours">48h</ToggleGroupItem>
                        </ToggleGroup>
                    </div>
                </div>
              </CardHeader>
              <CardContent className="pl-0">
                {isLoading ? (
                  <div className="flex items-center justify-center h-[600px]">
                    <Loader2 className="w-12 h-12 animate-spin text-primary" />
                  </div>
                ) : filteredGanttData.length > 0 ? (
                  <GanttChart data={filteredGanttData} timeRange={timeRange} key={selectedDate?.toISOString()}/>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[600px] text-muted-foreground gap-4">
                    <FileJson className="w-16 h-16" />
                    <p className="text-center">Tải lên tệp Excel hoặc CSV để tạo biểu đồ Gantt.</p>
                     <p className="text-xs text-center max-w-sm">Hỗ trợ các cột: Date, Heat_ID, Steel_Grade, Unit, Start_Time, End_Time, sequence_number (tùy chọn).</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {filteredGanttData.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline">Báo cáo chi tiết các mẻ</CardTitle>
                        <CardDescription>Tổng hợp thời gian xử lý và thời gian chờ cho các mẻ trong ngày đã chọn.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Mẻ (Heat ID)</TableHead>
                                    <TableHead>Mác thép (Grade)</TableHead>
                                    <TableHead className="text-right">Tổng thời gian xử lý (phút)</TableHead>
                                    <TableHead className="text-right">Tổng thời gian chờ (phút)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredGanttData.map(heat => (
                                    <TableRow key={heat.Heat_ID}>
                                        <TableCell className="font-medium">{heat.Heat_ID}</TableCell>
                                        <TableCell>{heat.Steel_Grade}</TableCell>
                                        <TableCell className="text-right flex items-center justify-end gap-2">
                                            <Timer className="w-4 h-4 text-muted-foreground" />
                                            {heat.totalDuration}
                                        </TableCell>
                                        <TableCell className="text-right flex items-center justify-end gap-2">
                                            <Hourglass className="w-4 h-4 text-muted-foreground" />
                                            {heat.totalIdleTime}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
