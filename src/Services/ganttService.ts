// src/lib/api/ganttService.ts
import axios from "axios";

export interface OperationDto {
  unit: string;
  group: string;
  sequence_Order: number | null;
  startTime: string;
  endTime: string;
  duration_Min: number;
  idleTimeMinutes?: number;
}

export interface GanttHeatDto {
  heat_ID: string;
  steel_Grade: string;
  operations: OperationDto[];
  castingMachine?: string;
  sequenceInCaster?: number | null;
  isComplete: boolean;
  totalDuration: number;
  totalIdleTime: number;
}

// ⚙️ Cấu hình base URL — có thể dùng biến môi trường
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const getGanttData = {
  getData: (fromDate?: string, toDate?: string) => {
    const params = new URLSearchParams();
    if (fromDate) params.append('startDate', fromDate);
    if (toDate) params.append('endDate', toDate);
    return api.get(`/SteelCycleTimes/demo?${params.toString()}`);
  },
  getDataDemo: (fromDate?: string, toDate?: string) => {
    const params = new URLSearchParams();
    if (fromDate) params.append('startDate', fromDate);
    if (toDate) params.append('endDate', toDate);
    return api.get(`/SteelCycleTimes?${params.toString()}`);
  },
};

// Lấy dữ liệu thùng gang thời điểm hiện tại từ production API
export interface ProductionBucketData {
  bkmiS_SoMe: string;
  bkmiS_ThungSo: string;
  bkmiS_Gio: string;
  g_Ca: number;
  gio_NM: string;
  ngayTao: string;
  iD_LoCao: number;
  chuyenDen: string;
  g_KLGangLong: number;
  gioChonMe: string;
  g_ID_TrangThai: number;
  t_ID_TrangThai: number;
}

export interface ProductionApiResponse {
  success: boolean;
  message: string;
  total: number;
  data: ProductionBucketData[];
}

export const getProductionDataGang = async (): Promise<ProductionBucketData[]> => {
  try {
    // Call via Next.js server-side proxy to avoid CORS and timeout issues
    const response = await fetch("https://report.hoaphatdungquat.vn/api/ProductApi/GetDuLieuThungGangThoiDiem", {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch production data: ${response.status}`);
    }

    const apiResponse: ProductionApiResponse = await response.json();
    
    if (apiResponse.success && Array.isArray(apiResponse.data)) {
      return apiResponse.data;
    }

    console.warn("Production API returned unexpected structure:", apiResponse);
    return [];
  } catch (error) {
    console.error("❌ Lỗi khi gọi API Production Data:", error);
    return [];
  }
};

// Lấy dữ liệu thùng gang theo khoảng ngày
export const getProductionDataByDate = async (
  fromDate: string,
  toDate: string
): Promise<ProductionBucketData[]> => {
  try {
    const response = await fetch(
      `https://report.hoaphatdungquat.vn/api/ProductApi/GetDuLieuThungGang?tuNgay=${fromDate}&denNgay=${toDate}`,
      {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch production data: ${response.status}`);
    }

    const apiResponse: ProductionApiResponse = await response.json();
    
    if (apiResponse.success && Array.isArray(apiResponse.data)) {
      return apiResponse.data;
    }

    console.warn("Production API returned unexpected structure:", apiResponse);
    return [];
  } catch (error) {
    console.error("❌ Lỗi khi gọi API Production Data By Date:", error);
    return [];
  }
};



// Lấy toàn bộ dữ liệu Gantt
// export const getGanttData = async (): Promise<GanttHeatDto[]> => {
//   try {
//     const res = await api.get("/SteelCycleTimes/demo");
//     return res.data.ganttData || res.data;
//   } catch (error) {
//     console.error("❌ Lỗi khi gọi API GanttData:", error);
//     return [];
//   }
// };

// // ✅ Lấy theo khoảng ngày
// export const getGanttDataByDate = async (
//   from: string,
//   to: string
// ): Promise<GanttHeatDto[]> => {
//   try {
//     const res = await api.get("/GanttData/list", { params: { from, to } });
//     return res.data.ganttData || res.data;
//   } catch (error) {
//     console.error("❌ Lỗi khi gọi API GanttData:", error);
//     return [];
//   }
// };
