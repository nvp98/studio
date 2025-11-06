"use client";

import * as XLSX from "xlsx";
import type {
  RawOperation,
  GroupedData,
  ProcessingResult,
  Operation,
  GanttHeat,
  ValidationError,
} from "./types";

const UNIT_SEQUENCE: { [key: string]: { group: string; order: number } } = {
  KR1: { group: "KR", order: 1 },
  KR2: { group: "KR", order: 1 },
  BOF1: { group: "BOF", order: 2 },
  BOF2: { group: "BOF", order: 2 },
  BOF3: { group: "BOF", order: 2 },
  BOF4: { group: "BOF", order: 2 },
  BOF5: { group: "BOF", order: 2 },
  LF1: { group: "LF", order: 3 },
  LF2: { group: "LF", order: 3 },
  LF3: { group: "LF", order: 3 },
  LF4: { group: "LF", order: 3 },
  LF5: { group: "LF", order: 3 },
  BCM1: { group: "CASTER", order: 4 },
  TSC1: { group: "CASTER", order: 4 },
};

const getGroup = (unit: string): string => {
  if (!unit) return "UNKNOWN";
  const upperUnit = String(unit).toUpperCase().trim();
  return UNIT_SEQUENCE[upperUnit]?.group || "UNKNOWN";
}
const getSequenceOrder = (unit: string): number => {
    if (!unit) return 99;
    const upperUnit = String(unit).toUpperCase().trim();
    return UNIT_SEQUENCE[upperUnit]?.order || 99;
}

const calculateDuration = (start: Date, end: Date): number => {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
};

function parseTime(
  timeValue: any,
  baseDate: Date,
  potentialPrevDate: Date | null
): Date | null {
  if (!timeValue && timeValue !== 0) return null;

  let parsedDate: Date;
  const datePart = new Date(baseDate);

  if (timeValue instanceof Date) {
    parsedDate = new Date(datePart.getFullYear(), datePart.getMonth(), datePart.getDate(), timeValue.getHours(), timeValue.getMinutes(), timeValue.getSeconds());
  } else if (typeof timeValue === "string") {
    const timeParts = timeValue.match(/(\d+):(\d+)(?::(\d+))?/);
    if (!timeParts) return null;

    const [, hours, minutes, seconds] = timeParts.map(part => parseInt(part, 10));
    parsedDate = new Date(datePart.getFullYear(), datePart.getMonth(), datePart.getDate(), hours, minutes, seconds || 0);
  } else if (typeof timeValue === "number") {
    // Handle Excel's time as a fraction of a day
    const excelDate = XLSX.SSF.parse_date_code(timeValue);
    if (!excelDate) return null;
    parsedDate = new Date(datePart.getFullYear(), datePart.getMonth(), datePart.getDate(), excelDate.H, excelDate.M, excelDate.S);
  } else {
    return null;
  }

  // Handle overnight schedules
  if (potentialPrevDate && parsedDate < potentialPrevDate) {
    parsedDate.setDate(parsedDate.getDate() + 1);
  }

  return parsedDate;
}

/**
 * Finds a key in an object in a case-insensitive way and trims whitespace.
 * @param obj The object to search in.
 * @param key The key to find.
 * @returns The value of the key if found, otherwise undefined.
 */
function findKey(obj: any, key: string): any {
    const keyLower = key.toLowerCase();
    for (const k in obj) {
        if (k.toLowerCase().trim() === keyLower) {
            return obj[k];
        }
    }
    return undefined;
}


function groupByHeatID(data: RawOperation[]): GroupedData {
  const grouped: GroupedData = {};
  data.forEach((row) => {
    const heatID = findKey(row, 'Heat_ID');
    if (heatID === undefined || heatID === null || String(heatID).trim() === '') return;

    const heatIDStr = String(heatID);
    if (!grouped[heatIDStr]) {
      grouped[heatIDStr] = {
        Heat_ID: heatIDStr,
        Steel_Grade: findKey(row, 'Steel_Grade'),
        operations: [],
      };
    }
    
    const operation: Partial<RawOperation> = {
      unit: findKey(row, 'unit'),
      Start_Time: findKey(row, 'Start_Time'),
      End_Time: findKey(row, 'End_Time'),
      Duration_min: findKey(row, 'Duration_min'),
      Date: findKey(row, 'Date'),
      sequence_number: findKey(row, 'sequence_number')
    };

    if (operation.unit && operation.unit !== 0 && operation.unit !== '0') {
      grouped[heatIDStr].operations.push(operation);
    }
  });
  return grouped;
}

function validateData(groupedData: GroupedData): ProcessingResult {
  const validHeats: GanttHeat[] = [];
  const validationErrors: ValidationError[] = [];
  

  Object.values(groupedData).forEach((heat) => {
    const heatErrors: string[] = [];
    let hasFatalError = false;

    const processedOps: Operation[] = [];
    let lastOpEndTime: Date | null = null;
    let baseDate: Date | null = null;

    const sortedRawOps = heat.operations
      .map(op => ({ ...op, sequence_order: op.sequence_number || getSequenceOrder(op.unit!) }))
      .sort((a, b) => a.sequence_order - b.sequence_order);

    if (sortedRawOps.length > 0 && sortedRawOps[0].Date) {
        if (sortedRawOps[0].Date instanceof Date) {
            baseDate = sortedRawOps[0].Date;
        } else if (typeof sortedRawOps[0].Date === 'string' || typeof sortedRawOps[0].Date === 'number') {
            const d = new Date(sortedRawOps[0].Date);
            if (!isNaN(d.getTime())) {
                baseDate = d;
            }
        }
    }
    if (!baseDate) {
      baseDate = new Date(); // Fallback to today
    }
    baseDate.setHours(0, 0, 0, 0);


    for (const rawOp of sortedRawOps) {
        if (!rawOp.unit || (!rawOp.Start_Time && rawOp.Start_Time !== 0) || (!rawOp.End_Time && rawOp.End_Time !== 0)) {
            heatErrors.push(`(Unit: ${rawOp.unit || 'N/A'}) has missing unit, start time, or end time.`);
            hasFatalError = true;
            continue;
        }
        
        const currentBaseDate = rawOp.Date instanceof Date ? rawOp.Date : baseDate;
        currentBaseDate.setHours(0,0,0,0);

        const startTime = parseTime(rawOp.Start_Time, currentBaseDate, lastOpEndTime);
        if (!startTime) {
            heatErrors.push(`${rawOp.unit}: Invalid start time format: ${rawOp.Start_Time}`);
            hasFatalError = true;
            continue;
        }

        const endTime = parseTime(rawOp.End_Time, currentBaseDate, startTime);
        if (!endTime) {
            heatErrors.push(`${rawOp.unit}: Invalid end time format: ${rawOp.End_Time}`);
            hasFatalError = true;
            continue;
        }

        if (endTime <= startTime) {
            heatErrors.push(`${rawOp.unit}: End time must be after start time.`);
            hasFatalError = true;
        }
        
        processedOps.push({
            unit: String(rawOp.unit),
            group: getGroup(String(rawOp.unit)),
            sequence_order: rawOp.sequence_order,
            Start_Time: String(rawOp.Start_Time),
            End_Time: String(rawOp.End_Time),
            startTime,
            endTime,
            Duration_min: rawOp.Duration_min || calculateDuration(startTime, endTime),
        });

        lastOpEndTime = endTime;
    }

    if (hasFatalError) {
        if(heatErrors.length > 0) validationErrors.push({ heat_id: heat.Heat_ID, errors: heatErrors });
        return;
    }

    // Process flow validation
    const hasBOF = processedOps.some((op) => op.group === "BOF");
    const hasLF = processedOps.some((op) => op.group === "LF");
    if (hasLF && !hasBOF) {
      heatErrors.push("Process Flow Error: LF operation found without a preceding BOF operation.");
    }
    
    // Check for overlaps
    for (let i = 1; i < processedOps.length; i++) {
        if (processedOps[i].startTime < processedOps[i - 1].endTime) {
            heatErrors.push(`Timing Error: ${processedOps[i].unit} starts before ${processedOps[i - 1].unit} finishes.`);
        }
    }

    if (heatErrors.length > 0) {
      validationErrors.push({ heat_id: heat.Heat_ID, errors: heatErrors });
    } else {
      validHeats.push({
        Heat_ID: heat.Heat_ID,
        Steel_Grade: String(heat.Steel_Grade),
        operations: processedOps,
      });
    }
  });

  return { validHeats, validationErrors };
}

export async function parseAndValidateExcel(file: File): Promise<ProcessingResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        if (!event.target?.result) {
          throw new Error("Failed to read file.");
        }
        const buffer = event.target.result;
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true, dateNF: 'yyyy-mm-dd' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const jsonFromSheet: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });

        if (!jsonFromSheet || jsonFromSheet.length < 2) {
            throw new Error("The Excel sheet is empty or has no data.");
        }
        
        const header: string[] = jsonFromSheet[0].map(h => h ? String(h).trim() : '');
        const lowerCaseHeader = header.map(h => h.toLowerCase());
        
        const requiredColumns = ["Heat_ID", "Steel_Grade", "unit", "Start_Time", "End_Time"];
        const missingColumns = requiredColumns.filter(col => !lowerCaseHeader.includes(col.toLowerCase()));

        if (missingColumns.length > 0) {
            throw new Error(`Missing required columns in Excel file: ${missingColumns.join(', ')}`);
        }
        
        const rawData: RawOperation[] = XLSX.utils.sheet_to_json(worksheet, {
            raw: false, // This ensures dates and times are parsed
            dateNF: 'HH:mm:ss',
        });

        if (!Array.isArray(rawData)) {
            throw new Error("Failed to convert sheet to JSON.");
        }

        const groupedData = groupByHeatID(rawData);
        const result = validateData(groupedData);
        resolve(result);
      } catch (error: any) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}
