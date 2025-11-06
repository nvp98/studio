
"use client";

import { useState, useMemo } from "react";
import { Loader2, ServerCrash, Download, Trash2, FileJson, ListX, BarChart2, FileDown, CalendarIcon, Timer, Hourglass, AlertCircle, Info } from "lucide-react";
import { FileUploader } from "@/components/file-uploader";
import { GanttChart } from "@/components/gantt-chart";
import { ValidationErrors } from "@/components/validation-errors";
import { parseExcel } from "@/lib/excel-parser";
import { validateAndTransform } from "@/lib/validator";
import type { GanttHeat, ValidationError, ExcelRow, Operation } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { HrcLtGanttChartIcon } from "@/components/icons";
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, isSameDay, startOfDay } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { groupBy } from "lodash";


interface Stats {
    totalHeats: number;
    totalOperations: number;
    totalIdleMinutes: number;
    errorCount: number;
    warningCount: number;
    steelGradeCount: number;
    avgProcessingTime: number;
}

interface GradeStats {
  [key: string]: {
    count: number;
    avgTimes: {
      KR: number;
      BOF: number;
      LF: number;
      CASTER: number;
    };
  };
}


export type TimeRange = 8 | 12 | 24 | 48;

export default function Home() {
  const [ganttData, setGanttData] = useState<GanttHeat[]>([]);
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
  const [selectedHeatDetails, setSelectedHeatDetails] = useState<GanttHeat | null>(null);

  const filteredGanttData = useMemo(() => {
    if (!selectedDate || ganttData.length === 0) return [];
    const dayStart = startOfDay(selectedDate);
    return ganttData.filter(heat => 
      heat.operations.some(op => isSameDay(op.startTime, dayStart) || isSameDay(op.endTime, dayStart))
    );
  }, [ganttData, selectedDate]);


  const resetState = () => {
    setGanttData([]);
    setValidationErrors([]);
    setWarnings([]);
    setError(null);
    setPreviewData([]);
    setCleanJson([]);
    setStats(null);
    setSelectedDate(new Date());
    setAvailableDates([]);
    setSelectedHeatDetails(null);
  }

  const updateStats = (heats: GanttHeat[], errors: ValidationError[], warnings: ValidationError[]) => {
       const uniqueHeats = new Set(heats.map(h => h.Heat_ID));
       const totalIdle = heats.reduce((acc, heat) => acc + heat.totalIdleTime, 0);
       const totalProcessingTime = heats.reduce((acc, heat) => acc + heat.totalDuration, 0);
       const uniqueGrades = new Set(heats.map(h => h.Steel_Grade));

      setStats({
          totalHeats: uniqueHeats.size,
          totalOperations: heats.reduce((acc, heat) => acc + heat.operations.length, 0),
          totalIdleMinutes: Math.round(totalIdle),
          errorCount: errors.length,
          warningCount: warnings.length,
          steelGradeCount: uniqueGrades.size,
          avgProcessingTime: heats.length > 0 ? Math.round(totalProcessingTime / heats.length) : 0,
      });
  }

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    updateStats(
      date ? ganttData.filter(heat => heat.operations.some(op => isSameDay(op.startTime, startOfDay(date)) || isSameDay(op.endTime, startOfDay(date)))) : [],
      validationErrors,
      warnings
    );
    setSelectedHeatDetails(null); // Deselect heat when date changes
  }


  const handleHeatSelect = (heat: GanttHeat | null) => {
    setSelectedHeatDetails(heat);
  }


  const detailedGradeStats = useMemo<GradeStats>(() => {
    if (filteredGanttData.length === 0) return {};

    const heatsByGrade = groupBy(filteredGanttData, 'Steel_Grade');
    const result: GradeStats = {};

    for (const grade in heatsByGrade) {
        const gradeHeats = heatsByGrade[grade];
        const gradeOps = gradeHeats.flatMap(h => h.operations);
        const opsByGroup = groupBy(gradeOps, 'group');

        const calcAvg = (ops: Operation[] | undefined) => {
            if (!ops || ops.length === 0) return 0;
            const total = ops.reduce((acc, op) => acc + op.Duration_min, 0);
            return Math.round(total / ops.length);
        }

        result[grade] = {
            count: gradeHeats.length,
            avgTimes: {
                KR: calcAvg(opsByGroup['KR']),
                BOF: calcAvg(opsByGroup['BOF']),
                LF: calcAvg(opsByGroup['LF']),
                CASTER: calcAvg(opsByGroup['CASTER']),
            }
        };
    }

    return result;
  }, [filteredGanttData]);


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

      const dates = [...new Set(validHeats.flatMap(h => h.operations.map(op => startOfDay(op.startTime).getTime())))].map(t => new Date(t));
      setAvailableDates(dates);
      
      const initialDate = dates.length > 0 ? dates[0] : new Date();
      setSelectedDate(initialDate);

      const initialFilteredHeats = validHeats.filter(heat => 
        heat.operations.some(op => isSameDay(op.startTime, startOfDay(initialDate)) || isSameDay(op.endTime, startOfDay(initialDate)))
      );
      updateStats(initialFilteredHeats, allErrors, allWarnings);

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
            <HrcLtGanttChartIcon className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold tracking-tighter font-headline">
              HRC1.LT Gantt Chart
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

            {stats && (
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 font-headline"><BarChart2 className="w-5 h-5" />Báo cáo tổng thể cho ngày {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : ''}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-sm">
                        <div>Tổng số mẻ: <span className="font-bold">{stats.totalHeats}</span></div>
                        <div>Tổng số công đoạn: <span className="font-bold">{stats.totalOperations}</span></div>
                        <div>Số mác thép: <span className="font-bold">{stats.steelGradeCount}</span></div>
                        <div>TB xử lý / mẻ (phút): <span className="font-bold">{stats.avgProcessingTime}</span></div>
                        <div className="col-span-2">Tổng thời gian chờ (phút): <span className="font-bold">{stats.totalIdleMinutes}</span></div>
                        <div>Số lỗi: <span className="font-bold text-destructive">{stats.errorCount}</span></div>
                        <div>Số cảnh báo: <span className="font-bold text-yellow-500">{stats.warningCount}</span></div>
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

            {validationErrors.length > 0 && (
                <ValidationErrors errors={validationErrors} title="Lỗi nghiêm trọng" description="Các lỗi này ngăn cản việc hiển thị mẻ trên biểu đồ." />
            )}

            {warnings.length > 0 && (
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="warnings">
                        <AccordionTrigger className="text-base font-headline flex items-center gap-2 p-4 rounded-lg bg-card border data-[state=closed]:hover:bg-accent/10">
                            <AlertCircle className="w-5 h-5 text-yellow-500" />
                            Cảnh báo & Ghi chú ({warnings.length})
                        </AccordionTrigger>
                        <AccordionContent className="pt-0 -mt-2">
                            <ValidationErrors errors={warnings} title="" description="Các vấn đề này không chặn việc xử lý nhưng cần được xem xét." isWarning noCard />
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            )}
          
          </div>
          <div className="xl:col-span-3 flex flex-col gap-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <CardTitle className="font-headline">Biểu đồ Gantt</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
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
                  <GanttChart 
                    data={filteredGanttData} 
                    timeRange={timeRange} 
                    onHeatSelect={handleHeatSelect}
                    key={selectedDate?.toISOString()}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-[600px] text-muted-foreground gap-4">
                    <FileJson className="w-16 h-16" />
                    <p className="text-center">Tải lên tệp Excel hoặc CSV để tạo biểu đồ Gantt.</p>
                     <p className="text-xs text-center max-w-sm">Hỗ trợ các cột: Date, Heat_ID, Steel_Grade, Unit, Start_Time, End_Time, sequence_number (tùy chọn).</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedHeatDetails && (
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2">
                           <Info className="w-5 h-5 text-primary" />
                           Chi tiết mẻ: {selectedHeatDetails.Heat_ID}
                        </CardTitle>
                        <CardDescription>
                            Mác thép: <span className="font-semibold">{selectedHeatDetails.Steel_Grade}</span> - 
                            Tổng thời gian xử lý: <span className="font-semibold">{selectedHeatDetails.totalDuration} phút</span> - 
                            Tổng thời gian chờ: <span className="font-semibold">{selectedHeatDetails.totalIdleTime} phút</span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Công đoạn (Unit)</TableHead>
                                    <TableHead>Bắt đầu</TableHead>
                                    <TableHead>Kết thúc</TableHead>
                                    <TableHead className="text-right">Thời gian xử lý (phút)</TableHead>
                                    <TableHead className="text-right">Thời gian chờ (phút)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedHeatDetails.operations.map((op, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-medium">{op.unit}</TableCell>
                                        <TableCell>{format(op.startTime, 'HH:mm')}</TableCell>
                                        <TableCell>{format(op.endTime, 'HH:mm')}</TableCell>
                                        <TableCell className="text-right">{op.Duration_min}</TableCell>
                                        <TableCell className="text-right">{op.idleTimeMinutes ? op.idleTimeMinutes : '-'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {Object.keys(detailedGradeStats).length > 0 && !selectedHeatDetails && (
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline">Báo cáo chi tiết theo mác thép</CardTitle>
                        <CardDescription>Thời gian xử lý trung bình (phút) qua từng nhóm công đoạn cho các mác thép trong ngày đã chọn.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Mác thép (Grade)</TableHead>
                                    <TableHead className="text-center">Số mẻ</TableHead>
                                    <TableHead className="text-right">TB KR</TableHead>
                                    <TableHead className="text-right">TB BOF</TableHead>
                                    <TableHead className="text-right">TB LF</TableHead>
                                    <TableHead className="text-right">TB Đúc (Caster)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Object.entries(detailedGradeStats).map(([grade, stats]) => (
                                    <TableRow key={grade}>
                                        <TableCell className="font-medium">{grade}</TableCell>
                                        <TableCell className="text-center">{stats.count}</TableCell>
                                        <TableCell className="text-right">{stats.avgTimes.KR > 0 ? stats.avgTimes.KR : '-'}</TableCell>
                                        <TableCell className="text-right">{stats.avgTimes.BOF > 0 ? stats.avgTimes.BOF : '-'}</TableCell>
                                        <TableCell className="text-right">{stats.avgTimes.LF > 0 ? stats.avgTimes.LF : '-'}</TableCell>
                                        <TableCell className="text-right">{stats.avgTimes.CASTER > 0 ? stats.avgTimes.CASTER : '-'}</TableCell>
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
