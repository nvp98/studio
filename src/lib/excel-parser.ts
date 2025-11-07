
import * as XLSX from "xlsx";
import type { ExcelRow, ValidationError } from "./types";

// Standardized keys we expect.
// The key is the normalized version of the header (lowercase, no spaces/special chars).
// The value is the property name in our ExcelRow object.
const MAPPING: Record<string, keyof ExcelRow> = {
    // Vietnamese variants
    thoigian: "dateStr",
    methep: "heatId",
    macthep: "steelGrade",
    congdoan: "unit",
    thoigianbatdau: "startStr",
    thoigianketthuc: "endStr",
    seq: "seqNum",
    
    // English variants
    date: "dateStr",
    heatid: "heatId",
    heat_id: "heatId",
    steelgrade: "steelGrade",
    steel_grade: "steelGrade",
    unit: "unit",
    starttime: "startStr",
    start_time: "startStr",
    endtime: "endStr",
    end_time: "endStr",
    sequencenumber: "seqNum",
    sequence_number: "seqNum",
};

const REQUIRED_KEYS: (keyof ExcelRow)[] = ["heatId", "steelGrade", "unit", "startStr", "endStr"];

// A more robust normalization function
const normalizeHeader = (header: string): string => {
    if (!header) return "";
    return header
        .toLowerCase()
        .normalize("NFD") // Decompose accented characters
        .replace(/[\u0300-\u036f]/g, "") // Remove diacritical marks
        .replace(/đ/g, "d") // Special case for Vietnamese 'đ'
        .replace(/\s+/g, '') // Remove spaces
        .replace(/_/g, ''); // Remove underscores
};


function excelSerialDateToDate(serial: number): Date {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);

    const fractional_day = serial - Math.floor(serial) + 0.0000001;

    let total_seconds = Math.floor(86400 * fractional_day);

    const seconds = total_seconds % 60;
    total_seconds -= seconds;

    const hours = Math.floor(total_seconds / (60 * 60));
    const minutes = Math.floor(total_seconds / 60) % 60;

    return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
}


function formatValue(value: any): string {
    if (value === null || value === undefined) {
        return "";
    }
    // Handle Excel time values (numbers between 0 and 1)
    if (typeof value === 'number' && value > 0 && value < 1) { // Changed >= to > to exclude 0
        const date = excelSerialDateToDate(value);
        const hours = date.getUTCHours().toString().padStart(2, '0');
        const minutes = date.getUTCMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }
    // Handle Excel dates (serial numbers)
    if (typeof value === 'number' && value > 1) {
        const date = XLSX.SSF.parse_date_code(value);
        // return new Date(date.y, date.m - 1, date.d, date.H, date.M, date.S).toLocaleDateString('en-CA');
        return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;

    }
    // Handle dates already parsed by XLSX
    if (value instanceof Date) {
        return value.toLocaleDateString('en-CA'); // YYYY-MM-DD
    }
    return String(value).trim();
}

/**
 * Parses raw rows (from either Excel or CSV) into structured ExcelRow objects.
 * @param json The raw data as an array of objects.
 * @returns An object containing parsed rows and any warnings.
 */
function processRows(rows: any[][]): { rows: ExcelRow[], warnings: ValidationError[] } {
    if (rows.length < 2) {
        throw new Error("Sheet trống hoặc không có dữ liệu.");
    }

    const rawHeaders = rows[0].map(h => String(h || ''));
    const normalizedHeaders = rawHeaders.map(normalizeHeader);
    
    // Map of the column index to the ExcelRow key
    const headerMap: Record<number, keyof ExcelRow> = {};
    // Set of found keys to check for required ones
    const foundKeys = new Set<keyof ExcelRow>();

    normalizedHeaders.forEach((normHeader, index) => {
        const mappedKey = MAPPING[normHeader];
        if (mappedKey) {
            headerMap[index] = mappedKey;
            foundKeys.add(mappedKey);
        }
    });

    const missingKeys = REQUIRED_KEYS.filter(key => !foundKeys.has(key));
    if (missingKeys.length > 0) {
         throw new Error(`Thiếu các cột bắt buộc: ${missingKeys.join(', ')}. Vui lòng kiểm tra lại tiêu đề cột.`);
    }

    const dataRows = rows.slice(1);
    const parsedRows: ExcelRow[] = [];
    const warnings: ValidationError[] = [];

    dataRows.forEach((rowData, index) => {
        if (rowData.every(cell => cell === null || cell === '' || cell === undefined)) {
            return; // Skip completely empty row
        }

        const excelRow: Partial<ExcelRow> = { rawIndex: index + 2 }; // +2 because of header and 1-based index

        Object.entries(headerMap).forEach(([colIndex, key]) => {
            const cellValue = rowData[Number(colIndex)];
            (excelRow as any)[key] = formatValue(cellValue);
        });
        
        const finalRow = excelRow as ExcelRow;
        
        // Filter out placeholder rows
        if (finalRow.unit === '0' || (finalRow.startStr === '00:00' && finalRow.endStr === '00:00')) {
            warnings.push({
                heat_id: finalRow.heatId || `Hàng ${finalRow.rawIndex}`,
                kind: 'PLACEHOLDER',
                message: `Bỏ qua hàng giữ chỗ (Unit='0' hoặc thời gian 0:00).`,
            });
            return;
        }
        
        // Validate time format
        const timeRegex = /^\d{1,2}:\d{2}$/;
        if ((finalRow.startStr && !timeRegex.test(finalRow.startStr)) || (finalRow.endStr && !timeRegex.test(finalRow.endStr))) {
             warnings.push({
                heat_id: finalRow.heatId || `Hàng ${finalRow.rawIndex}`,
                kind: 'FORMAT',
                message: `Định dạng thời gian không hợp lệ ở hàng ${finalRow.rawIndex}. Dự kiến H:MM hoặc HH:MM. Giá trị: '${finalRow.startStr}' / '${finalRow.endStr}'`,
            });
            return;
        }

        if(finalRow.seqNum) {
            finalRow.seqNum = Number(finalRow.seqNum)
        }


        parsedRows.push(finalRow);
    });

    return { rows: parsedRows, warnings };
}


/**
 * Parses an Excel or CSV file into a clean list of ExcelRow objects.
 * @param file The file to parse.
 * @returns A promise that resolves with the parsed data and any initial parsing warnings.
 */
export async function parseExcel(file: File): Promise<{ rows: ExcelRow[], warnings: ValidationError[] }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                if (!event.target?.result) {
                    throw new Error("Không thể đọc được tệp.");
                }
                const data = event.target.result;
                const workbook = XLSX.read(data, { type: "array", cellDates: true, cellNF: false, cellText: false });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, defval: null });
                
                resolve(processRows(json as any[][]));

            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);

        reader.readAsArrayBuffer(file);
    });
}
