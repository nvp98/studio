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

// A row parsed directly from excel, before validation
export interface ExcelRow {
  dateStr: string;
  heatId: string;
  steelGrade: string;
  unit: string;
  startStr: string;
  endStr:string;
  seqNum?: number;
  rawIndex: number; // original row index from the sheet
}


// Processed operation with calculated fields
export interface Operation {
  unit: string;
  group: string;
  sequence_order: number;
  startTime: Date;
  endTime: Date;
  Duration_min: number;
  idleTimeMinutes?: number; // Minutes since the previous operation for this heat ended
}

// A heat, which is a collection of operations
export interface Heat {
  Heat_ID: string;
  Steel_Grade: string;
  operations: Operation[];
  isComplete: boolean;
  totalDuration: number;
  totalIdleTime: number;
}

// Validated heat data ready for Gantt chart
export interface GanttHeat extends Heat {}

// Structure for validation errors
export interface ValidationError {
  heat_id: string;
  kind: 'FORMAT' | 'ROUTING' | 'TIME' | 'UNIT' | 'MISSING' | 'PLACEHOLDER';
  message: string;
  opIndex?: number;
  unit?: string;
}

// Grouped data after initial parsing
export interface GroupedData {
  [key: string]: {
    Heat_ID: string;
    Steel_Grade: string;
    operations: Partial<RawOperation>[];
  };
}

export interface ProcessingResult {
    validHeats: GanttHeat[];
    errors: ValidationError[];
    warnings: ValidationError[];
    stats: {
        totalHeats: number;
        totalOperations: number;
        totalIdleMinutes: number;
        errorCount: number;
        warningCount: number;
    };
    cleanJson: ExcelRow[];
}
