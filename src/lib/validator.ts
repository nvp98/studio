
import type { ExcelRow, ValidationError, Operation, GanttHeat } from "./types";
import { groupBy } from "lodash";
import { startOfDay } from 'date-fns';

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
  BCM2: { group: "CASTER", order: 4 },
  BCM3: { group: "CASTER", order: 4 },
  TSC1: { group: "CASTER", order: 4 },
  TSC2: { group: "CASTER", order: 4 },
};

function parseTimeWithDate(dateStr: string, hhmm: string, baseDate: Date, prevTime?: Date): Date | null {
    if (!hhmm) return null;

    const [hours, minutes] = hhmm.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return null;

    // Use the row's specific date string if available, otherwise fall back to the baseDate from the first row.
    let targetDate = dateStr ? new Date(dateStr) : baseDate;
    // If date is invalid, it's a critical error for parsing.
    if (isNaN(targetDate.getTime())) return null; 

    let currentTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), hours, minutes);

    // Handle overnight logic: if the current time is significantly earlier than the previous time
    // (e.g., 23:00 then 01:00), assume it's the next day.
    if (prevTime && currentTime < prevTime) {
        currentTime.setDate(currentTime.getDate() + 1);
    }
    
    return currentTime;
}

export function validateAndTransform(rows: ExcelRow[]): { validHeats: GanttHeat[], errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    const validHeats: GanttHeat[] = [];
    const baseDate = rows.length > 0 && rows[0].dateStr ? startOfDay(new Date(rows[0].dateStr)) : startOfDay(new Date());
    
    const heats = groupBy(rows, 'heatId');

    for (const heatId in heats) {
        const heatRows = heats[heatId];
        let heatHasFatalError = false;

        // Sort by sequence number if available, then by raw index to maintain stability for parsing
        const sortedRowsForParsing = heatRows.sort((a, b) => {
            if (a.seqNum != null && b.seqNum != null) {
                 if(a.seqNum !== b.seqNum) return a.seqNum - b.seqNum;
            }
            // Fallback to start time if seqNum is not reliable
            if(a.startStr && b.startStr) {
                if(a.startStr !== b.startStr) return a.startStr.localeCompare(b.startStr);
            }
            return a.rawIndex - b.rawIndex;
        });

        const tempOps: (Operation & { raw: ExcelRow })[] = [];
        let lastOpEndTime: Date | undefined = undefined;

        // First pass: Parse times and create temporary operations
        for (const row of sortedRowsForParsing) {
             const unitInfo = UNIT_SEQUENCE[row.unit.toUpperCase()];
            if (!unitInfo) {
                errors.push({ heat_id: heatId, kind: 'UNIT', unit: row.unit, message: `Đơn vị không xác định: '${row.unit}'.`, opIndex: row.rawIndex });
                continue; // It's a warning, but we can't process it.
            }
            
            const startTime = parseTimeWithDate(row.dateStr, row.startStr, baseDate, lastOpEndTime);
            if (!startTime) {
                 errors.push({ heat_id: heatId, kind: 'FORMAT', unit: row.unit, message: `Thời gian bắt đầu không hợp lệ '${row.startStr}'.`, opIndex: row.rawIndex });
                 heatHasFatalError = true;
                 continue;
            }

            const endTime = parseTimeWithDate(row.dateStr, row.endStr, baseDate, startTime);
            if (!endTime) {
                 errors.push({ heat_id: heatId, kind: 'FORMAT', unit: row.unit, message: `Thời gian kết thúc không hợp lệ '${row.endStr}'.`, opIndex: row.rawIndex });
                 heatHasFatalError = true;
                 continue;
            }
            
            const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
            if (duration < 0) {
                errors.push({ heat_id: heatId, kind: 'TIME', unit: row.unit, message: `Thời gian kết thúc phải sau thời gian bắt đầu.`, opIndex: row.rawIndex });
                heatHasFatalError = true;
                continue;
            }

            tempOps.push({
                unit: row.unit,
                group: unitInfo.group,
                sequence_order: row.seqNum ?? unitInfo.order,
                startTime,
                endTime,
                Duration_min: Math.round(duration),
                raw: row,
            });
            lastOpEndTime = endTime;
        }

        if (heatHasFatalError) continue;

        // Second pass: Sort by actual start time for logic validation
        const ops = tempOps.sort((a,b) => a.startTime.getTime() - b.startTime.getTime());

        // === Final Validation Rules on Sorted Operations ===
        let hasValidationError = false;
        
        // Rule: Subsequent operations must start after or at the same time the previous one ends.
        for (let i = 1; i < ops.length; i++) {
            if (ops[i].startTime < ops[i - 1].endTime) {
                errors.push({ 
                    heat_id: heatId, 
                    kind: 'TIME', 
                    message: `Chồng chéo thời gian: ${ops[i].unit} bắt đầu trước khi ${ops[i-1].unit} kết thúc.` 
                });
                hasValidationError = true;
            }
        }
        
        // Rule: A heat can't be on multiple units of the same group (e.g. BOF1 and BOF2), *except for LF*.
        const groupCounts = ops.reduce((acc, op) => {
            acc[op.group] = (acc[op.group] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        for (const group in groupCounts) {
            if (group !== 'LF' && groupCounts[group] > 1) {
                const unitsInGroup = ops.filter(op => op.group === group).map(op => op.unit).join(', ');
                errors.push({ heat_id: heatId, kind: 'ROUTING', message: `Mẻ không thể chạy trên nhiều thiết bị cùng nhóm ${group}: ${unitsInGroup}.` });
                hasValidationError = true;
            }
        }


        // Rule: LF requires a preceding BOF.
        const lfOps = ops.filter(op => op.group === 'LF');
        const bofOp = ops.find(op => op.group === 'BOF');

        if (lfOps.length > 0 && !bofOp) {
             errors.push({ heat_id: heatId, kind: 'ROUTING', unit: lfOps.map(o => o.unit).join(','), message: `Tìm thấy công đoạn LF nhưng không có công đoạn BOF trước đó.` });
             hasValidationError = true;
        }

        // Rule: If LF exists, its start time must be after BOF's end time.
        if (bofOp && lfOps.length > 0) {
            for (const lfOp of lfOps) {
                if (lfOp.startTime < bofOp.endTime) {
                     errors.push({ heat_id: heatId, kind: 'ROUTING', message: `LF (${lfOp.unit}) bắt đầu trước khi BOF (${bofOp.unit}) kết thúc.` });
                     hasValidationError = true;
                }
            }
        }

        // If no fatal validation errors for this heat, calculate final properties and add it.
        if (!hasValidationError) {
            // Recalculate idle times based on final sorted order
            for (let i = 1; i < ops.length; i++) {
                ops[i].idleTimeMinutes = Math.round((ops[i].startTime.getTime() - ops[i - 1].endTime.getTime()) / (1000 * 60));
            }
            ops[0].idleTimeMinutes = 0; // First operation has no preceding idle time

            const hasCaster = ops.some(op => op.group === 'CASTER');
            const totalDuration = ops.reduce((acc, op) => acc + op.Duration_min, 0);
            const totalIdleTime = ops.reduce((acc, op) => acc + (op.idleTimeMinutes || 0), 0);

            validHeats.push({
                Heat_ID: heatId,
                Steel_Grade: heatRows[0].steelGrade,
                operations: ops.map(({raw, ...op}) => op), // remove raw data
                isComplete: hasCaster,
                totalDuration,
                totalIdleTime
            });
        }
    }

    return { validHeats, errors };
}
