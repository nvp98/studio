// Raw data structure from Excel
export interface RawOperation {
  Heat_ID: string;
  Steel_Grade: string;
  unit: string;
  Start_Time: any; // Can be string, number, or Date
  End_Time: any; // Can be string, number, or Date
  Duration_min?: number;
  Date?: any;
  sequence_number?: number;
}

// Processed operation with calculated fields
export interface Operation {
  unit: string;
  group: string;
  sequence_order: number;
  Start_Time: string; // Original string value
  End_Time: string;   // Original string value
  startTime: Date;
  endTime: Date;
  Duration_min: number;
}

// A heat, which is a collection of operations
export interface Heat {
  Heat_ID: string;
  Steel_Grade: string;
  operations: Operation[];
}

// Validated heat data ready for Gantt chart
export interface GanttHeat extends Heat {}

// Structure for validation errors
export interface ValidationError {
  heat_id: string;
  errors: string[];
}

// Grouped data after initial parsing
export interface GroupedData {
  [key: string]: {
    Heat_ID: string;
    Steel_Grade: string;
    operations: Partial<RawOperation>[];
  };
}

// Result from the main processing function
export interface ProcessingResult {
  validHeats: GanttHeat[];
  validationErrors: ValidationError[];
}
