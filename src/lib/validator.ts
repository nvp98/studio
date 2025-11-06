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

    let targetDate = dateStr ? new Date(dateStr) : baseDate;
    if (isNaN(targetDate.getTime())) return null;
    
    let currentTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), hours, minutes);

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
        const ops: Operation[] = [];
        let heatHasFatalError = false;
        
        let lastOpEndTime: Date | undefined = undefined;

        // Sort by sequence number, then by raw index to maintain stability
        const sortedRows = heatRows.sort((a, b) => {
            const seqA = a.seqNum ?? Infinity;
            const seqB = b.seqNum ?? Infinity;
            if(seqA !== seqB) return seqA - seqB;
            return a.rawIndex - b.rawIndex;
        });

        for (let i = 0; i < sortedRows.length; i++) {
            const row = sortedRows[i];
            const unitInfo = UNIT_SEQUENCE[row.unit.toUpperCase()];
            
            if (!unitInfo) {
                errors.push({ heat_id: heatId, kind: 'UNIT', unit: row.unit, message: `Đơn vị không xác định: '${row.unit}'.`, opIndex: i });
                continue; // Skip this operation
            }
            
            const startTime = parseTimeWithDate(row.dateStr, row.startStr, baseDate, lastOpEndTime);
            if (!startTime) {
                 errors.push({ heat_id: heatId, kind: 'FORMAT', unit: row.unit, message: `Thời gian bắt đầu không hợp lệ '${row.startStr}' cho đơn vị ${row.unit}.`, opIndex: i });
                 heatHasFatalError = true;
                 continue;
            }

            const endTime = parseTimeWithDate(row.dateStr, row.endStr, baseDate, startTime);
            if (!endTime) {
                 errors.push({ heat_id: heatId, kind: 'FORMAT', unit: row.unit, message: `Thời gian kết thúc không hợp lệ '${row.endStr}' cho đơn vị ${row.unit}.`, opIndex: i });
                 heatHasFatalError = true;
                 continue;
            }
            
            const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
            if (duration < 0) {
                errors.push({ heat_id: heatId, kind: 'TIME', unit: row.unit, message: `Thời gian kết thúc phải sau thời gian bắt đầu cho đơn vị ${row.unit}.`, opIndex: i });
                heatHasFatalError = true;
            }

            const idleTime = lastOpEndTime ? (startTime.getTime() - lastOpEndTime.getTime()) / (1000 * 60) : 0;
            
            ops.push({
                unit: row.unit,
                group: unitInfo.group,
                sequence_order: row.seqNum ?? unitInfo.order,
                startTime,
                endTime,
                Duration_min: Math.round(duration),
                idleTimeMinutes: Math.round(idleTime),
            });
            lastOpEndTime = endTime;
        }

        if(heatHasFatalError) continue;

        // Sort ops again based on final sequence order and start times for routing validation
        ops.sort((a,b) => {
            if(a.sequence_order !== b.sequence_order) return a.sequence_order - b.sequence_order;
            return a.startTime.getTime() - b.startTime.getTime();
        });


        // === Final Validation Rules on Sorted Operations ===
        let hasValidationError = false;
        
        // Rule: A heat can't be on multiple units of the same group (e.g. BOF1 and BOF2)
        const groupCounts = ops.reduce((acc, op) => {
            acc[op.group] = (acc[op.group] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        for (const group in groupCounts) {
            if (groupCounts[group] > 1) {
                const unitsInGroup = ops.filter(op => op.group === group).map(op => op.unit).join(', ');
                errors.push({ heat_id: heatId, kind: 'ROUTING', message: `Mẻ không thể chạy trên nhiều thiết bị cùng nhóm ${group}: ${unitsInGroup}.` });
                hasValidationError = true;
            }
        }

        // Rule: Subsequent operations must start after the previous one ends.
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
        
        // Rule: LF requires a preceding BOF.
        const lfOp = ops.find(op => op.group === 'LF');
        const bofOp = ops.find(op => op.group === 'BOF');

        if (lfOp && !bofOp) {
             errors.push({ heat_id: heatId, kind: 'ROUTING', unit: lfOp.unit, message: `Tìm thấy công đoạn LF (${lfOp.unit}) nhưng không có công đoạn BOF trước đó.` });
             hasValidationError = true;
        }


        if (errors.filter(e => e.heat_id === heatId && e.kind !== 'UNIT' && e.kind !== 'PLACEHOLDER').length === 0 && !hasValidationError) {
            const hasCaster = ops.some(op => op.group === 'CASTER');
            const totalDuration = ops.reduce((acc, op) => acc + op.Duration_min, 0);
            const totalIdleTime = ops.reduce((acc, op) => acc + (op.idleTimeMinutes || 0), 0);

            validHeats.push({
                Heat_ID: heatId,
                Steel_Grade: heatRows[0].steelGrade,
                operations: ops,
                isComplete: hasCaster,
                totalDuration,
                totalIdleTime
            });
        }
    }

    return { validHeats, errors };
}
