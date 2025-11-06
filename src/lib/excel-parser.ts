
import * as XLSX from "xlsx";
import type { ExcelRow, ValidationError } from "./types";

// Standardized keys we expect
const MAPPING: Record<string, keyof ExcelRow> = {
    date: "dateStr",
    heatid: "heatId",
    steelgrade: "steelGrade",
    unit: "unit",
    starttime: "startStr",
    endtime: "endStr",
    sequencenumber: "seqNum",
};
const REQUIRED_KEYS = ["heatid", "steelgrade", "unit", "starttime", "endtime"];

/**
 * Normalizes a header string by making it lowercase, trimming whitespace, and removing spaces/underscores.
 * @param header The header string to normalize.
 * @returns The normalized header.
 */
const normalizeHeader = (header: string): string => {
    if (!header) return "";
    return header.toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
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
    if (typeof value === 'number' && value >= 0 && value < 1) {
        const date = excelSerialDateToDate(value);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }
    // Handle dates
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
    
    const missingKeys = REQUIRED_KEYS.filter(key => !normalizedHeaders.includes(key));
    if (missingKeys.length > 0) {
         const originalMissingNames = Object.entries(MAPPING)
            .filter(([k,v]) => missingKeys.includes(k))
            .map(([k,v])=> Object.keys(MAPPING).find(key => MAPPING[key] === v) || k); // Find original name
         throw new Error(`Thiếu các cột bắt buộc: ${originalMissingNames.join(', ')}`);
    }

    const headerMap: Record<number, keyof ExcelRow> = {};
    normalizedHeaders.forEach((normHeader, index) => {
        const mappedKey = Object.keys(MAPPING).find(key => normalizeHeader(key) === normHeader);
        if (mappedKey && MAPPING[mappedKey]) {
            headerMap[index] = MAPPING[mappedKey];
        }
    });

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
        if (finalRow.unit === '0' || (finalRow.startStr === '0:00' && finalRow.endStr === '0:00')) {
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
                message: `Định dạng thời gian không hợp lệ ở hàng ${finalRow.rawIndex}. Dự kiến H:MM hoặc HH:MM.`,
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
                const buffer = event.target.result;
                let json: any[][];

                if (file.name.endsWith('.csv')) {
                    const text = new TextDecoder("utf-8").decode(buffer as ArrayBuffer);
                    // Simple CSV parser
                    json = text.split('\n').map(row => row.split(',').map(cell => cell.trim()));
                } else {
                    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    json = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, defval: "" });
                }
                
                resolve(processRows(json));

            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);

        if (file.name.endsWith('.csv')) {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsArrayBuffer(file);
        }
    });
}
