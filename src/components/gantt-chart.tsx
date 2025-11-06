
"use client";

import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Line,
} from "recharts";
import { useMemo } from "react";
import * as d3 from "d3";
import type { GanttHeat } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import _ from "lodash";

interface GanttChartProps {
  data: GanttHeat[];
}

const UNIT_ORDER = [
  "KR1", "KR2", "BOF1", "BOF2", "BOF3", "BOF4", "BOF5", "LF1", "LF2", "LF3", "LF4", "LF5", "BCM1", "BCM2", "BCM3", "TSC1", "TSC2"
].reverse(); // Reverse to have KR1 at the top in a vertical layout

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload; // This is the data for the specific Y-axis unit
    
    // Find the first relevant data point in the payload
    const payloadItem = payload.find(p => {
        const keyMatch = p.dataKey && String(p.dataKey).match(/(.+)_(duration|start)/);
        return keyMatch && data.tooltips && data.tooltips[keyMatch[1]];
    });

    if (!payloadItem) return null;

    const key = payloadItem.dataKey;
    const heatIdMatch = String(key).match(/(.+)_(duration|start)/);
    if (!heatIdMatch) return null;

    const heatId = heatIdMatch[1];
    const heatData = data.tooltips[heatId];

    if (!heatData) return null;

    // Tooltip for connecting lines (idle time)
     if (payload.some(p => String(p.dataKey).includes('_idle_line'))) {
        if (!heatData || !heatData.prevOp) return null;
        const idleTime = Math.round((heatData.startTime.getTime() - heatData.prevOp.endTime.getTime()) / (1000 * 60));
        return (
             <Card>
                <CardContent className="p-3 text-sm">
                    <p className="font-bold">Mẻ: {heatData.Heat_ID} ({heatData.Steel_Grade})</p>
                    <p className="font-bold text-primary">Chuyển tiếp (Chờ)</p>
                    <hr className="my-1"/>
                    <p>Từ: {heatData.prevOp.unit} (kết thúc {heatData.prevOp.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</p>
                    <p>Đến: {heatData.unit} (bắt đầu {heatData.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</p>
                    {idleTime > 0 && <p className="text-yellow-600">Thời gian chờ: {idleTime} phút</p>}
                </CardContent>
            </Card>
        );
    }

    // Tooltip for operation bars
    return (
      <Card>
        <CardContent className="p-3 text-sm">
          <p className="font-bold">Mẻ thép: {heatData.Heat_ID} ({heatData.Steel_Grade})</p>
          <p>Thiết bị: {heatData.unit} ({heatData.group})</p>
          <hr className="my-1"/>
          <p>Bắt đầu: {heatData.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          <p>Kết thúc: {heatData.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          <p>Thời gian: {heatData.Duration_min} phút</p>
          {heatData.idleTimeMinutes > 0 && <p className="text-yellow-600">Chờ (từ công đoạn trước): {heatData.idleTimeMinutes} phút</p>}
        </CardContent>
      </Card>
    );
  }
  return null;
};


export function GanttChart({ data }: GanttChartProps) {
  const { chartData, heatToColor, earliestTime, latestTime, connectingLines } = useMemo(() => {
    if (data.length === 0) {
      return { chartData: [], heatToColor: new Map(), earliestTime: 0, latestTime: 0, connectingLines: [] };
    }

    let allTimes = data.flatMap(heat => heat.operations.flatMap(op => [op.startTime.getTime(), op.endTime.getTime()]));
    const earliest = d3.timeMinute.offset(new Date(Math.min(...allTimes)), -15).getTime();
    const latest = d3.timeMinute.offset(new Date(Math.max(...allTimes)), 15).getTime();

    const heatColorMap = new Map<string, string>();
    const heatIDs = data.map(h => h.Heat_ID);
    const colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(heatIDs);
    data.forEach(heat => {
      heatColorMap.set(heat.Heat_ID, colorScale(heat.Heat_ID));
    });
    
    const lines: any[] = [];

    const transformedData = UNIT_ORDER.map(unit => {
      const entry: any = { unit, tooltips: {} };
      data.forEach(heat => {
        // IMPORTANT: Operations must be sorted for prevOp logic to be correct
        const sortedOps = _.sortBy(heat.operations, 'startTime');
        const op = sortedOps.find(o => o.unit === unit);
        if (op) {
          const opIndex = sortedOps.findIndex(o => o.unit === unit);
          const prevOp = opIndex > 0 ? sortedOps[opIndex - 1] : undefined;

          // Time values are in minutes from the earliest time
          const opStart = (op.startTime.getTime() - earliest) / (1000 * 60);

          // Transparent bar for positioning
          entry[`${heat.Heat_ID}_start`] = opStart; 
          // The actual visible bar
          entry[`${heat.Heat_ID}_duration`] = op.Duration_min;
          
          entry.tooltips[heat.Heat_ID] = { ...op, Heat_ID: heat.Heat_ID, Steel_Grade: heat.Steel_Grade, prevOp };
        }
      });
      return entry;
    });

    data.forEach(heat => {
        const heatOps = _.sortBy(heat.operations, 'startTime');
        const color = heatColorMap.get(heat.Heat_ID) || '#ccc';

        for (let i = 0; i < heatOps.length - 1; i++) {
            const op1 = heatOps[i];
            const op2 = heatOps[i+1];
            if (UNIT_ORDER.includes(op1.unit) && UNIT_ORDER.includes(op2.unit)) {
                lines.push({
                    key: `line-${heat.Heat_ID}-${i}`,
                    heatId: heat.Heat_ID,
                    color: color,
                    points: [
                        { unit: op1.unit, time: (op1.endTime.getTime() - earliest) / (1000 * 60) },
                        { unit: op2.unit, time: (op2.startTime.getTime() - earliest) / (1000 * 60) },
                    ]
                });
            }
        }
    });


    return { chartData: transformedData, heatToColor: heatColorMap, earliestTime: earliest, latestTime: latest, connectingLines: lines };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[600px] text-muted-foreground">
        <p>Không có dữ liệu hợp lệ để hiển thị.</p>
      </div>
    );
  }

  const timeDomain = [0, (latestTime - earliestTime) / (1000 * 60)];
  const tickFormatter = (tick: number) => {
    const date = new Date(earliestTime + tick * 60000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  
  const yTickFormatter = (value: string) => value.replace(/ /g, '\u00A0');

  // Calculate a dynamic height based on the number of units
  const chartHeight = Math.max(600, UNIT_ORDER.length * 35 + 100);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <ComposedChart
        data={chartData}
        layout="vertical"
        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        barCategoryGap="30%"
      >
        <XAxis 
            type="number" 
            domain={timeDomain} 
            tickFormatter={tickFormatter} 
            axisLine={false} 
            tickLine={{ stroke: 'var(--border)' }} 
            tick={{fontSize: 12, fill: 'var(--foreground)'}}
            orientation="top"
            padding={{ left: 10, right: 10 }}
            allowDataOverflow
        />
        <YAxis 
            type="category" 
            dataKey="unit" 
            width={60} 
            axisLine={false} 
            tickLine={false} 
            tick={{fontSize: 12, fill: 'var(--foreground)'}}
            tickFormatter={yTickFormatter}
            interval={0}
            padding={{ top: 10, bottom: 10 }}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--accent) / 0.2)' }}/>
        
        {/* Transparent bars for stacking offset */}
        {data.map(heat => (
            <Bar key={`${heat.Heat_ID}_start_offset`} dataKey={`${heat.Heat_ID}_start`} stackId="gantt" fill="transparent" isAnimationActive={false} />
        ))}
        
        {/* Visible bars for duration */}
        {data.map(heat => {
            const color = heatToColor.get(heat.Heat_ID) || '#000000';
            return (
                <Bar
                    key={`${heat.Heat_ID}_duration_bar`}
                    dataKey={`${heat.Heat_ID}_duration`}
                    stackId="gantt"
                    fill={color}
                    radius={[4, 4, 4, 4]}
                    isAnimationActive={false}
                >
                    <LabelList 
                        dataKey="tooltips" 
                        content={({ value, x, y, width, height }) => {
                            const heatData = value[heat.Heat_ID];
                            if (!heatData || !x || !width) return null;

                            const textWidth = heat.Heat_ID.length * 7; 
                            if (width < textWidth) return null;

                            return (
                                <text x={x + width / 2} y={y + height / 2 + 1} fill="#fff" textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="500">
                                    {heat.Heat_ID}
                                </text>
                            );
                        }} 
                    />
                </Bar>
            );
        })}

        {/* Connecting Lines */}
        {connectingLines.map(lineInfo => (
            <Line
                key={lineInfo.key}
                type="linear"
                data={chartData.map(entry => {
                    // Create a data point for the start of the line
                    if (entry.unit === lineInfo.points[0].unit) {
                        return { ...entry, line_pos: lineInfo.points[0].time };
                    }
                    // Create a data point for the end of the line
                    if (entry.unit === lineInfo.points[1].unit) {
                        return { ...entry, line_pos: lineInfo.points[1].time };
                    }
                    return { ...entry, line_pos: null };
                })}
                dataKey="line_pos"
                stroke={lineInfo.color}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                isAnimationActive={false}
                connectNulls={true}
                xAxisId={0}
                yAxisId={0}
                tooltipType="none" 
            />
        ))}


      </ComposedChart>
    </ResponsiveContainer>
  );
}

    

    
