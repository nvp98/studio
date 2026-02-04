"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Loader2,
  ServerCrash,
  Download,
  Trash2,
  FileJson,
  ListX,
  BarChart2,
  FileDown,
  CalendarIcon,
  Timer,
  Hourglass,
  AlertCircle,
  Info,
  Star,
  Zap,
} from "lucide-react";
import { FileUploader } from "@/components/file-uploader";
import { GanttChart } from "@/components/gantt-chart";
import { ValidationErrors } from "@/components/validation-errors";
import { parseExcel } from "@/lib/excel-parser";
import { validateAndTransform } from "@/lib/validator";
import type {
  GanttHeat,
  ValidationError,
  ExcelRow,
  Operation,
} from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { HrcLtGanttChartIcon } from "@/components/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  format,
  isSameDay,
  startOfDay,
  isWithinInterval,
  addDays,
} from "date-fns";
import { DateRange } from "react-day-picker";
import { vi } from "date-fns/locale";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { groupBy } from "lodash";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { processGoogleSheetAction, uploadHeatsAction } from "./actions";
import * as d3 from "d3";

import mockData from "../Services/demoDataExcel.json"; // 👈 import trực tiếp
import { getGanttData } from "@/Services/ganttService";
import { any } from "zod";

interface OpStat {
  heatId: string;
  duration: number;
}

interface Stats {
  totalHeats: number;
  avgIdleMinutes: number;
  steelGradeCount: number;
  avgProcessingTime: number;

  longestOverall: OpStat | null;
  longestKR: OpStat | null;
  longestBOF: OpStat | null;
  longestLF: OpStat | null;
  longestCaster: OpStat | null;

  shortestOverall: OpStat | null;
  shortestKR: OpStat | null;
  shortestBOF: OpStat | null;
  shortestLF: OpStat | null;
  shortestCaster: OpStat | null;
}

interface UnitTimeStats {
  avg: number;
  min: number;
  max: number;
}

interface GradeStats {
  [key: string]: {
    count: number;
    kr: UnitTimeStats;
    bof: UnitTimeStats;
    lf: UnitTimeStats;
    caster: UnitTimeStats;
  };
}

export type TimeRange = 8 | 12 | 24 | 48;
export type GanttLayout = "default" | "userDefined";

// Original logical order
const DEFAULT_UNIT_ORDER = [
  "KR1",
  "KR2",
  "BOF1",
  "BOF2",
  "BOF3",
  "BOF4",
  "BOF5",
  "LF1",
  "LF2",
  "LF3",
  "LF4",
  "LF5",
  "BCM1",
  "BCM2",
  "BCM3",
  "TSC1",
  "TSC2",
];

// User specified order
const USER_DEFINED_UNIT_ORDER = [
  "BCM3",
  "BCM2",
  "LF4",
  "LF1",
  "BOF5",
  "BOF2",
  "BCM1",
  "LF3",
  "BOF1",
  "KR1",
  "KR2",
  "BOF4",
  "BOF3",
  "LF2",
  "LF5",
  "TSC2",
  "TSC1",
];

export default function Home() {
  const [ganttData, setGanttData] = useState<GanttHeat[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    [],
  );
  const [warnings, setWarnings] = useState<ValidationError[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ExcelRow[]>([]);
  const [cleanJson, setCleanJson] = useState<ExcelRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>(24);
  const [ganttLayout, setGanttLayout] = useState<GanttLayout>("default");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [availableDates, setAvailableDates] = useState<Date[]>([]);
  const [selectedHeatId, setSelectedHeatId] = useState<string | null>(null);
  const [googleSheetUrl, setGoogleSheetUrl] = useState("");

  const selectedHeatDetails = useMemo(() => {
    if (!selectedHeatId) return null;
    return ganttData.find((h) => h.Heat_ID === selectedHeatId) || null;
  }, [selectedHeatId, ganttData]);

  const filteredGanttData = useMemo(() => {
    if (!dateRange || !dateRange.from || ganttData.length === 0)
      return ganttData;

    const start = startOfDay(dateRange.from);
    const end = dateRange.to ? startOfDay(dateRange.to) : start;

    return ganttData.filter((heat) =>
      heat.operations.some(
        (op) =>
          isWithinInterval(op.startTime, { start, end: addDays(end, 1) }) ||
          isWithinInterval(op.endTime, { start, end: addDays(end, 1) }),
      ),
    );
  }, [ganttData, dateRange]);

  const resetState = () => {
    setGanttData([]);
    setValidationErrors([]);
    setWarnings([]);
    setError(null);
    setPreviewData([]);
    setCleanJson([]);
    setStats(null);
    setDateRange(undefined);
    setAvailableDates([]);
    setSelectedHeatId(null);
  };

  const processData = useCallback(
    (parsedRows: ExcelRow[], parseWarnings: ValidationError[]) => {
      setPreviewData(parsedRows.slice(0, 20));
      setCleanJson(parsedRows);

      const { validHeats, errors: validationErrs } =
        validateAndTransform(parsedRows);
      // console.log("parsedRows:", parsedRows);
      const allWarnings = [
        ...parseWarnings,
        ...validationErrs.filter(
          (e) => e.kind === "PLACEHOLDER" || e.kind === "UNIT",
        ),
      ];
      const allErrors = validationErrs.filter(
        (e) => e.kind !== "PLACEHOLDER" && e.kind !== "UNIT",
      );

      setGanttData(validHeats);
      setValidationErrors(allErrors);
      setWarnings(allWarnings);

      if (validHeats.length > 0) {
        const dates = [
          ...new Set(
            validHeats.flatMap((h) =>
              h.operations.map((op) => startOfDay(op.startTime).getTime()),
            ),
          ),
        ].map((t) => new Date(t));
        setAvailableDates(dates);

        if (dates.length > 0) {
          const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
          const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
          setDateRange({ from: minDate, to: maxDate });
        }
      } else {
        setDateRange(undefined);
      }
    },
    [],
  );

  const updateStats = (heats: GanttHeat[]) => {
    const uniqueHeats = new Set(heats.map((h) => h.Heat_ID));
    const totalIdle = heats.reduce((acc, heat) => acc + heat.totalIdleTime, 0);
    const totalProcessingTime = heats.reduce(
      (acc, heat) => acc + heat.totalDuration,
      0,
    );
    const uniqueGrades = new Set(heats.map((h) => h.Steel_Grade));

    let longestOverall: OpStat | null = null;
    let shortestOverall: OpStat | null = null;
    if (heats.length > 0) {
      const heatWithLongestTime = heats.reduce((prev, current) =>
        prev.totalDuration > current.totalDuration ? prev : current,
      );
      longestOverall = {
        heatId: heatWithLongestTime.Heat_ID,
        duration: heatWithLongestTime.totalDuration,
      };

      const heatWithShortestTime = heats.reduce((prev, current) =>
        prev.totalDuration < current.totalDuration ? prev : current,
      );
      shortestOverall = {
        heatId: heatWithShortestTime.Heat_ID,
        duration: heatWithShortestTime.totalDuration,
      };
    }

    const findOpStatInGroup = (
      group: string,
      type: "longest" | "shortest",
    ): OpStat | null => {
      const groupOps = heats.flatMap((h) =>
        h.operations
          .filter((op) => op.group === group)
          .map((op) => ({ ...op, Heat_ID: h.Heat_ID })),
      );
      if (groupOps.length === 0) return null;

      const op = groupOps.reduce((prev, current) => {
        if (type === "longest") {
          return prev.Duration_min > current.Duration_min ? prev : current;
        }
        return prev.Duration_min < current.Duration_min ? prev : current;
      });

      return { heatId: op.Heat_ID, duration: op.Duration_min };
    };

    setStats({
      totalHeats: uniqueHeats.size,
      avgIdleMinutes:
        uniqueHeats.size > 0 ? Math.round(totalIdle / uniqueHeats.size) : 0,
      steelGradeCount: uniqueGrades.size,
      avgProcessingTime:
        uniqueHeats.size > 0
          ? Math.round(totalProcessingTime / uniqueHeats.size)
          : 0,
      longestOverall,
      longestKR: findOpStatInGroup("KR", "longest"),
      longestBOF: findOpStatInGroup("BOF", "longest"),
      longestLF: findOpStatInGroup("LF", "longest"),
      longestCaster: findOpStatInGroup("CASTER", "longest"),
      shortestOverall,
      shortestKR: findOpStatInGroup("KR", "shortest"),
      shortestBOF: findOpStatInGroup("BOF", "shortest"),
      shortestLF: findOpStatInGroup("LF", "shortest"),
      shortestCaster: findOpStatInGroup("CASTER", "shortest"),
    });
  };

  const handleDateRangeSelect = async (range: DateRange | undefined) => {
    if (!range?.from) {
      setDateRange(range);
      setSelectedHeatId(null);
      return;
    }

    setDateRange(range);
    setSelectedHeatId(null);
    setIsLoading(true);
    setError(null);

    try {
      const startDate = format(range.from, "yyyy-MM-dd");
      const endDate = range.to ? format(range.to, "yyyy-MM-dd") : startDate;

      const result = await getGanttData.getDataDemo(startDate, endDate);
      
      // Xử lý data nhưng KHÔNG set lại dateRange để tránh vòng lặp
      const parsedRows = result.data;
      setPreviewData(parsedRows.slice(0, 20));
      setCleanJson(parsedRows);

      const { validHeats, errors: validationErrs } = validateAndTransform(parsedRows);
      const allWarnings = validationErrs.filter(
        (e) => e.kind === "PLACEHOLDER" || e.kind === "UNIT"
      );
      const allErrors = validationErrs.filter(
        (e) => e.kind !== "PLACEHOLDER" && e.kind !== "UNIT"
      );

      setGanttData(validHeats);
      setValidationErrors(allErrors);
      setWarnings(allWarnings);

      // Cập nhật availableDates nhưng KHÔNG set dateRange
      if (validHeats.length > 0) {
        const dates = [
          ...new Set(
            validHeats.flatMap((h) =>
              h.operations.map((op) => startOfDay(op.startTime).getTime())
            )
          ),
        ].map((t) => new Date(t));
        setAvailableDates(dates);
      }
    } catch (e: any) {
      console.error(e);
      setError(`Lỗi khi tải dữ liệu: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Update stats whenever filteredGanttData changes
  useMemo(() => {
    updateStats(filteredGanttData);
  }, [filteredGanttData]);

  // console.log(JSON.stringify(mockGanttHeats, null, 2));

  useEffect(() => {
    const loadDemoData = async () => {
      try {
        setIsLoading(true);

        // const res = await fetch("/mock_heats.json");
        // const json = dataDemo;
        // const data = mockData; // 👈 lấy mảng ganttData từ JSON
        const data = await getGanttData.getData();

        // 🔧 Parse startTime / endTime về dạng Date + Tính Duration và IdleTime
        const parsed = data.data.map((heat: any) => {
          // Parse operations với Date objects
          const operations = (heat.operations || [])
            .map((op: any) => ({
              ...op,
              startTime: new Date(op.startTime),
              endTime: new Date(op.endTime),
              // Tính duration nếu chưa có
              Duration_min:
                op.Duration_min ||
                Math.round(
                  (new Date(op.endTime).getTime() -
                    new Date(op.startTime).getTime()) /
                    (1000 * 60),
                ),
            }))
            .sort(
              (a: any, b: any) => a.startTime.getTime() - b.startTime.getTime(),
            ); // Sắp xếp theo startTime

          // Tính idle time cho từng operation
          // operations.forEach((op: any, i: number) => {
          //   if (i === 0) {
          //     op.idleTimeMinutes = 0;
          //   } else {
          //     const idle = Math.round(
          //       (op.startTime.getTime() - operations[i - 1].endTime.getTime()) / (1000 * 60)
          //     );
          //     op.idleTimeMinutes = idle > 0 ? idle : 0;
          //   }
          // });

          // Tính tổng duration và totalIdleTime
          const totalDuration = operations.reduce(
            (acc: number, op: any) => acc + op.Duration_min,
            0,
          );
          const totalIdleTime = operations.reduce(
            (acc: number, op: any) => acc + (op.idleTimeMinutes || 0),
            0,
          );

          return {
            ...heat,
            operations,
            totalDuration: heat.totalDuration || totalDuration,
            totalIdleTime: heat.totalIdleTime || totalIdleTime,
          };
        });

        // 🔧 Cập nhật state chính
        setGanttData(parsed);

        // 🔧 Xác định range ngày và availableDates
        const allDates = parsed.flatMap((h: any) =>
          h.operations.map(
            (op: { startTime: string | number | Date }) =>
              new Date(op.startTime),
          ),
        );

        if (allDates.length > 0) {
          const minDate = new Date(
            Math.min(...allDates.map((d: any) => d.getTime())),
          );
          const maxDate = new Date(
            Math.max(...allDates.map((d: any) => d.getTime())),
          );

          setAvailableDates(
            Array.from(new Set(allDates.map((d: any) => d.toDateString()))).map(
              (s: any) => new Date(s),
            ),
          );
          setDateRange({ from: minDate, to: maxDate });
        }

        // 🔧 Cập nhật thống kê tổng thể
        updateStats(parsed);
      } catch (err) {
        // console.error("❌ Lỗi tải mock_heats.json:", err);
        setError("Không thể đọc dữ liệu demo.");
      } finally {
        setIsLoading(false);
      }
    };

    // loadDemoData();

    const initData = async () => {
      setIsLoading(true);
      resetState();
      setError(null);
      try {
        const parsedRows = await getGanttData.getDataDemo();
        processData(parsedRows.data, []);
      } catch (e: any) {
        console.error(e);
        setError(`Đã xảy ra lỗi: ${e.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    initData();
  }, []);

  const handleHeatSelect = (heatId: string | null) => {
    setSelectedHeatId(heatId);
  };

  const handleStatClick = (heatId: string | null) => {
    if (heatId) {
      const heat = filteredGanttData.find((h) => h.Heat_ID === heatId);
      if (heat) {
        setSelectedHeatId(heat.Heat_ID);
        const heatDate = startOfDay(heat.operations[0].startTime);

        // Find if this date exists in the current range
        if (dateRange?.from && dateRange?.to) {
          if (
            !isWithinInterval(heatDate, {
              start: dateRange.from,
              end: dateRange.to,
            })
          ) {
            // If not, set the range to the month of the heat
            setDateRange({ from: heatDate, to: heatDate });
          }
        } else {
          setDateRange({ from: heatDate, to: heatDate });
        }

        const ganttElement = document.getElementById("gantt-chart-card");
        ganttElement?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  const detailedGradeStats = useMemo<GradeStats>(() => {
    if (filteredGanttData.length === 0) return {};

    const heatsByGrade = groupBy(filteredGanttData, "Steel_Grade");
    const result: GradeStats = {};
    // console.log("Calculating stats for grade:", heatsByGrade);
    for (const grade in heatsByGrade) {
      const gradeHeats = heatsByGrade[grade];
      const gradeOps = gradeHeats.flatMap((h) => h.operations);
      const opsByGroup = groupBy(gradeOps, "group");
      const calcStats = (ops: Operation[] | undefined): UnitTimeStats => {
        if (!ops || ops.length === 0) return { avg: 0, min: 0, max: 0 };

        const durations = ops.map((op) => op.Duration_min);
        const total = durations.reduce((acc, time) => acc + time, 0);

        return {
          avg: Math.round(total / ops.length),
          min: Math.min(...durations),
          max: Math.max(...durations),
        };
      };

      result[grade] = {
        count: gradeHeats.length,
        kr: calcStats(opsByGroup["KR"]),
        bof: calcStats(opsByGroup["BOF"]),
        lf: calcStats(opsByGroup["LF"]),
        // Use canonical group name "CASTER" for caster statistics
        caster: calcStats(opsByGroup["CASTER"]),
      };
    }

    return result;
  }, [filteredGanttData]);

  const handleFileProcess = async (file: File) => {
    setIsLoading(true);
    resetState();
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const { rows: parsedRows, warnings: parseWarnings } =
        await parseExcel(file);
      processData(parsedRows, parseWarnings);
    } catch (e: any) {
      console.error(e);
      setError(`Đã xảy ra lỗi: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // const handleSheetProcess = async () => {
  //   if (!googleSheetUrl) {
  //     setError("Vui lòng nhập URL của Google Sheet.");
  //     return;
  //   }
  //   setIsLoading(true);
  //   resetState();
  //   setError(null);
  //   try {
  //     const result = await processGoogleSheetAction(googleSheetUrl);
  //     if (result.success && result.data) {
  //       processData(result.data);
  //     } else {
  //       setError(result.error || "Không thể xử lý Google Sheet.");
  //     }
  //   } catch (e: any) {
  //     console.error(e);
  //     setError(`Đã xảy ra lỗi khi xử lý Google Sheet: ${e.message}`);
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  const exportToJson = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(cleanJson, null, 2),
    )}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = "raw_clean.json";
    link.click();
  };

  const exportErrorsToCsv = () => {
    const csvRows = [
      ["Heat_ID", "Kind", "Unit", "Message"],
      ...[...validationErrors, ...warnings].map((e) => [
        e.heat_id,
        e.kind,
        e.unit || "",
        `"${e.message}"`,
      ]),
    ];
    const csvString = csvRows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "error_log.csv");
    link.style.visibility = "hidden";
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
            {/* <FileUploader
              onFileProcess={handleFileProcess}
              isLoading={isLoading}
            /> */}

            {/* <a href="/sample-data.xlsx" download="sample-data.xlsx">
              <Button variant="outline" className="w-full">
                <FileDown className="mr-2 h-4 w-4" /> Tải về tệp mẫu
              </Button>
            </a> */}

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
                  <CardTitle className="flex items-center gap-2 font-headline">
                    <BarChart2 className="w-5 h-5" />
                    Báo cáo tổng thể
                  </CardTitle>
                  <CardDescription>
                    {dateRange?.from
                      ? dateRange.to && !isSameDay(dateRange.from, dateRange.to)
                        ? `Từ ${format(dateRange.from, "dd/MM")} đến ${format(
                            dateRange.to,
                            "dd/MM/yyyy",
                          )}`
                        : format(dateRange.from, "dd/MM/yyyy")
                      : "Tất cả dữ liệu"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 text-sm">
                  <div className="col-span-2">
                    Tổng số mẻ:{" "}
                    <span className="font-bold">{stats.totalHeats}</span>
                  </div>
                  <div className="col-span-2">
                    Số mác thép:{" "}
                    <span className="font-bold">{stats.steelGradeCount}</span>
                  </div>
                  <div className="col-span-2">
                    TB xử lý / mẻ (phút):{" "}
                    <span className="font-bold">{stats.avgProcessingTime}</span>
                  </div>
                  <div className="col-span-2">
                    TB chờ / mẻ (phút):{" "}
                    <span className="font-bold">{stats.avgIdleMinutes}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {stats && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-headline">
                    <Star className="w-5 h-5 text-yellow-400" />
                    Mẻ nổi bật (Lâu nhất)
                  </CardTitle>
                  <CardDescription>
                    Các mẻ có thời gian xử lý dài nhất
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  {stats.longestOverall && (
                    <div
                      onClick={() =>
                        handleStatClick(stats.longestOverall!.heatId)
                      }
                      className="flex justify-between cursor-pointer hover:bg-accent/50 p-1 rounded-md"
                    >
                      <span>Tổng thể:</span>{" "}
                      <span className="font-bold">
                        {stats.longestOverall.heatId} (
                        {stats.longestOverall.duration}p)
                      </span>
                    </div>
                  )}
                  {stats.longestKR && (
                    <div
                      onClick={() => handleStatClick(stats.longestKR!.heatId)}
                      className="flex justify-between cursor-pointer hover:bg-accent/50 p-1 rounded-md"
                    >
                      <span>KR:</span>{" "}
                      <span className="font-bold">
                        {stats.longestKR.heatId} ({stats.longestKR.duration}p)
                      </span>
                    </div>
                  )}
                  {stats.longestBOF && (
                    <div
                      onClick={() => handleStatClick(stats.longestBOF!.heatId)}
                      className="flex justify-between cursor-pointer hover:bg-accent/50 p-1 rounded-md"
                    >
                      <span>BOF:</span>{" "}
                      <span className="font-bold">
                        {stats.longestBOF.heatId} ({stats.longestBOF.duration}p)
                      </span>
                    </div>
                  )}
                  {stats.longestLF && (
                    <div
                      onClick={() => handleStatClick(stats.longestLF!.heatId)}
                      className="flex justify-between cursor-pointer hover:bg-accent/50 p-1 rounded-md"
                    >
                      <span>LF:</span>{" "}
                      <span className="font-bold">
                        {stats.longestLF.heatId} ({stats.longestLF.duration}p)
                      </span>
                    </div>
                  )}
                  {stats.longestCaster && (
                    <div
                      onClick={() =>
                        handleStatClick(stats.longestCaster!.heatId)
                      }
                      className="flex justify-between cursor-pointer hover:bg-accent/50 p-1 rounded-md"
                    >
                      <span>Đúc:</span>{" "}
                      <span className="font-bold">
                        {stats.longestCaster.heatId} (
                        {stats.longestCaster.duration}p)
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {stats && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-headline">
                    <Zap className="w-5 h-5 text-green-400" />
                    Mẻ nổi bật (Ngắn nhất)
                  </CardTitle>
                  <CardDescription>
                    Các mẻ có thời gian xử lý ngắn nhất
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  {stats.shortestOverall && (
                    <div
                      onClick={() =>
                        handleStatClick(stats.shortestOverall!.heatId)
                      }
                      className="flex justify-between cursor-pointer hover:bg-accent/50 p-1 rounded-md"
                    >
                      <span>Tổng thể:</span>{" "}
                      <span className="font-bold">
                        {stats.shortestOverall.heatId} (
                        {stats.shortestOverall.duration}p)
                      </span>
                    </div>
                  )}
                  {stats.shortestKR && (
                    <div
                      onClick={() => handleStatClick(stats.shortestKR!.heatId)}
                      className="flex justify-between cursor-pointer hover:bg-accent/50 p-1 rounded-md"
                    >
                      <span>KR:</span>{" "}
                      <span className="font-bold">
                        {stats.shortestKR.heatId} ({stats.shortestKR.duration}p)
                      </span>
                    </div>
                  )}
                  {stats.shortestBOF && (
                    <div
                      onClick={() => handleStatClick(stats.shortestBOF!.heatId)}
                      className="flex justify-between cursor-pointer hover:bg-accent/50 p-1 rounded-md"
                    >
                      <span>BOF:</span>{" "}
                      <span className="font-bold">
                        {stats.shortestBOF.heatId} ({stats.shortestBOF.duration}
                        p)
                      </span>
                    </div>
                  )}
                  {stats.shortestLF && (
                    <div
                      onClick={() => handleStatClick(stats.shortestLF!.heatId)}
                      className="flex justify-between cursor-pointer hover:bg-accent/50 p-1 rounded-md"
                    >
                      <span>LF:</span>{" "}
                      <span className="font-bold">
                        {stats.shortestLF.heatId} ({stats.shortestLF.duration}p)
                      </span>
                    </div>
                  )}
                  {stats.shortestCaster && (
                    <div
                      onClick={() =>
                        handleStatClick(stats.shortestCaster!.heatId)
                      }
                      className="flex justify-between cursor-pointer hover:bg-accent/50 p-1 rounded-md"
                    >
                      <span>Đúc:</span>{" "}
                      <span className="font-bold">
                        {stats.shortestCaster.heatId} (
                        {stats.shortestCaster.duration}p)
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {previewData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Xem trước dữ liệu (20 dòng đầu)</CardTitle>
                  <CardDescription>
                    Dữ liệu đã được chuẩn hóa từ file đã tải lên.
                  </CardDescription>
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
              <Button
                onClick={exportToJson}
                disabled={cleanJson.length === 0}
                variant="outline"
                className="w-full"
              >
                <Download className="mr-2 h-4 w-4" /> Export Clean JSON
              </Button>
              <Button
                onClick={exportErrorsToCsv}
                disabled={
                  validationErrors.length === 0 && warnings.length === 0
                }
                variant="outline"
                className="w-full"
              >
                <ListX className="mr-2 h-4 w-4" /> Export Error Log
              </Button>
              {/* <Button
                onClick={resetState}
                variant="destructive"
                className="w-full col-span-2"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Reset
              </Button> */}
            </div>

            {validationErrors.length > 0 && (
              <ValidationErrors
                errors={validationErrors}
                title="Lỗi nghiêm trọng"
                description="Các lỗi này ngăn cản việc hiển thị mẻ trên biểu đồ."
              />
            )}

            {warnings.length > 0 && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="warnings">
                  <AccordionTrigger className="text-base font-headline flex items-center gap-2 p-4 rounded-lg bg-card border data-[state=closed]:hover:bg-accent/10">
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                    Cảnh báo & Ghi chú ({warnings.length})
                  </AccordionTrigger>
                  <AccordionContent className="pt-0 -mt-2">
                    <ValidationErrors
                      errors={warnings}
                      title=""
                      description="Các vấn đề này không chặn việc xử lý nhưng cần được xem xét."
                      isWarning
                      noCard
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>
          <div className="xl:col-span-3 flex flex-col gap-6">
            <Card id="gantt-chart-card">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <CardTitle className="font-headline">Biểu đồ Gantt</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="date"
                          variant={"outline"}
                          className="w-[300px] justify-start text-left font-normal"
                          disabled={availableDates.length === 0}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange?.from ? (
                            dateRange.to &&
                            !isSameDay(dateRange.from, dateRange.to) ? (
                              <>
                                {format(dateRange.from, "LLL dd, y")} -{" "}
                                {format(dateRange.to, "LLL dd, y")}
                              </>
                            ) : (
                              format(dateRange.from, "LLL dd, y")
                            )
                          ) : (
                            <span>Chọn khoảng ngày</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={dateRange?.from}
                          selected={dateRange}
                          onSelect={handleDateRangeSelect}
                          numberOfMonths={2}
                          // disabled={(date) =>
                          //   !availableDates.some((ad) => isSameDay(ad, date))
                          // }
                          modifiers={{ available: availableDates }}
                          modifiersClassNames={{
                            available: "bg-primary/20 rounded-md",
                          }}
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
                      <ToggleGroupItem value="8" aria-label="8 hours">
                        8h
                      </ToggleGroupItem>
                      <ToggleGroupItem value="12" aria-label="12 hours">
                        12h
                      </ToggleGroupItem>
                      <ToggleGroupItem value="24" aria-label="24 hours">
                        24h
                      </ToggleGroupItem>
                      <ToggleGroupItem value="48" aria-label="48 hours">
                        48h
                      </ToggleGroupItem>
                    </ToggleGroup>

                    <Button
                      onClick={() =>
                        setGanttLayout(
                          ganttLayout === "default" ? "userDefined" : "default",
                        )
                      }
                      variant="outline"
                      size="sm"
                      className="whitespace-nowrap"
                    >
                      {ganttLayout === "default" ? "Tùy chỉnh" : "Mặc định"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pl-0">
                {isLoading ? (
                  <div className="flex items-center justify-center h-[600px]">
                    <Loader2 className="w-12 h-12 animate-spin text-primary" />
                  </div>
                ) : ganttData.length > 0 ? (
                  <GanttChart
                    data={filteredGanttData}
                    timeRange={timeRange}
                    onHeatSelect={handleHeatSelect}
                    selectedHeatId={selectedHeatId}
                    unitOrder={
                      ganttLayout === "default"
                        ? DEFAULT_UNIT_ORDER
                        : USER_DEFINED_UNIT_ORDER
                    }
                    key={`${dateRange?.from?.toISOString()}-${ganttLayout}`}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-[600px] text-muted-foreground gap-4">
                    <FileJson className="w-16 h-16" />
                    <p className="text-center">
                      Tải lên tệp Excel để tạo biểu đồ Gantt.
                    </p>
                    <p className="text-xs text-center max-w-sm">
                      Hỗ trợ các cột: Date, Heat_ID, Steel_Grade, Unit,
                      Start_Time, End_Time, sequence_number (tùy chọn).
                    </p>
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
                    Mác thép:{" "}
                    <span className="font-semibold">
                      {selectedHeatDetails.Steel_Grade}
                    </span>{" "}
                    - Tổng thời gian xử lý:{" "}
                    <span className="font-semibold">
                      {selectedHeatDetails.totalDuration} phút
                    </span>{" "}
                    - Tổng thời gian chờ:{" "}
                    <span className="font-semibold">
                      {selectedHeatDetails.totalIdleTime} phút
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Công đoạn (Unit)</TableHead>
                        <TableHead>Bắt đầu</TableHead>
                        <TableHead>Kết thúc</TableHead>
                        <TableHead className="text-right">
                          Thời gian xử lý (phút)
                        </TableHead>
                        <TableHead className="text-right">
                          Thời gian chờ (phút)
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedHeatDetails.operations.map((op, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            {op.unit}
                          </TableCell>
                          <TableCell>{format(op.startTime, "HH:mm")}</TableCell>
                          <TableCell>{format(op.endTime, "HH:mm")}</TableCell>
                          <TableCell className="text-right">
                            {op.Duration_min}
                          </TableCell>
                          <TableCell className="text-right">
                            {op.idleTimeMinutes ? op.idleTimeMinutes : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {Object.keys(detailedGradeStats).length > 0 &&
              !selectedHeatDetails && (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-headline">
                      Báo cáo chi tiết theo mác thép
                    </CardTitle>
                    <CardDescription>
                      Thời gian xử lý (phút) qua từng nhóm công đoạn cho các mác
                      thép trong khoảng thời gian đã chọn.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead rowSpan={2} className="align-bottom">
                              Mác thép (Grade)
                            </TableHead>
                            <TableHead
                              rowSpan={2}
                              className="text-center align-bottom"
                            >
                              Số mẻ
                            </TableHead>
                            <TableHead
                              rowSpan={2}
                              className="text-right align-bottom"
                            >
                              TB KR
                            </TableHead>
                            <TableHead
                              colSpan={3}
                              className="text-center border-l"
                            >
                              BOF
                            </TableHead>
                            <TableHead
                              colSpan={3}
                              className="text-center border-l"
                            >
                              LF
                            </TableHead>
                            <TableHead
                              rowSpan={2}
                              className="text-right align-bottom border-l"
                            >
                              TB Đúc
                            </TableHead>
                          </TableRow>
                          <TableRow>
                            <TableHead className="text-right">TB</TableHead>
                            <TableHead className="text-right">Min</TableHead>
                            <TableHead className="text-right">Max</TableHead>
                            <TableHead className="text-right border-l">
                              TB
                            </TableHead>
                            <TableHead className="text-right">Min</TableHead>
                            <TableHead className="text-right">Max</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(detailedGradeStats).map(
                            ([grade, stats]) => (
                              <TableRow key={grade}>
                                <TableCell className="font-medium">
                                  {grade}
                                </TableCell>
                                <TableCell className="text-center">
                                  {stats.count}
                                </TableCell>

                                <TableCell className="text-right">
                                  {stats.kr.avg > 0 ? stats.kr.avg : "-"}
                                </TableCell>

                                <TableCell className="text-right border-l">
                                  {stats.bof.avg > 0 ? stats.bof.avg : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {stats.bof.min > 0 ? stats.bof.min : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {stats.bof.max > 0 ? stats.bof.max : "-"}
                                </TableCell>

                                <TableCell className="text-right border-l">
                                  {stats.lf.avg > 0 ? stats.lf.avg : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {stats.lf.min > 0 ? stats.lf.min : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {stats.lf.max > 0 ? stats.lf.max : "-"}
                                </TableCell>

                                <TableCell className="text-right border-l">
                                  {stats.caster.avg > 0
                                    ? stats.caster.avg
                                    : "-"}
                                </TableCell>
                              </TableRow>
                            ),
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
          </div>
        </div>
      </main>
    </div>
  );
}
