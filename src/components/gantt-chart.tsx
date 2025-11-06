
"use client";

import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { GanttHeat, Operation } from '@/lib/types';
import _ from 'lodash';
import type { TimeRange } from '@/app/page';

interface GanttChartProps {
  data: GanttHeat[];
  timeRange: TimeRange;
}

const UNIT_ORDER = [
  "KR1", "KR2", "BOF1", "BOF2", "BOF3", "BOF4", "BOF5", "LF1", "LF2", "LF3", "LF4", "LF5", "BCM1", "BCM2", "BCM3", "TSC1", "TSC2"
];

export function GanttChart({ data: heats, timeRange }: GanttChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [selectedHeatId, setSelectedHeatId] = useState<string | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !tooltipRef.current || heats.length === 0) {
      if (chartContainerRef.current) {
         d3.select(chartContainerRef.current).select("svg").remove();
      }
      return;
    }

    const drawD3Gantt = () => {
      const chartOutputEl = chartContainerRef.current!;
      const tooltipEl = d3.select(tooltipRef.current);
      
      d3.select(chartOutputEl).select("svg").remove();

      let allOperations: (Operation & { Heat_ID: string; Steel_Grade: string; })[] = [];
      let minTime = new Date(8640000000000000);
      let maxTime = new Date(-8640000000000000);
      
      const heatIDs = heats.map(h => h.Heat_ID);
      let linksData: { Heat_ID: string; Steel_Grade: string; op1: Operation; op2: Operation }[] = [];

      heats.forEach(heat => {
        const sortedOps = _.sortBy(heat.operations, 'startTime');
        
        for (let i = 0; i < sortedOps.length - 1; i++) {
          linksData.push({ Heat_ID: heat.Heat_ID, Steel_Grade: heat.Steel_Grade, op1: sortedOps[i], op2: sortedOps[i+1] });
        }

        sortedOps.forEach(op => {
          if (op.startTime < minTime) minTime = op.startTime;
          if (op.endTime > maxTime) maxTime = op.endTime;
          allOperations.push({ ...op, Heat_ID: heat.Heat_ID, Steel_Grade: heat.Steel_Grade });
        });
      });

      const originalOpCount = allOperations.length;
      allOperations = allOperations.filter(op => UNIT_ORDER.includes(op.unit));
      
      if (allOperations.length < originalOpCount) {
        console.warn(`Filtered ${originalOpCount - allOperations.length} operations due to unit mismatch.`);
      }
      if(allOperations.length === 0) return;

      const fullTimeDomainStart = d3.timeMinute.offset(minTime, -15);
      const fullTimeDomainEnd = d3.timeMinute.offset(maxTime, 15);
      const visibleTimeDomainEnd = d3.timeHour.offset(fullTimeDomainStart, timeRange);

      const margin = { top: 30, right: 30, bottom: 30, left: 60 };
      const containerWidth = chartOutputEl.clientWidth;
      const height = (UNIT_ORDER.length * 35); // 35px row height
      
      const totalTimeMinutes = (fullTimeDomainEnd.getTime() - fullTimeDomainStart.getTime()) / 60000;
      const visibleTimeMinutes = timeRange * 60;
      const width = containerWidth * (totalTimeMinutes / visibleTimeMinutes);


      const svg = d3.select(chartOutputEl)
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .on("click", (event) => { // Click on background to deselect
            if (event.target === event.currentTarget) {
                setSelectedHeatId(null);
            }
        })
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      const xScale = d3.scaleTime().domain([fullTimeDomainStart, fullTimeDomainEnd]).range([0, width]);
      const yScale = d3.scaleBand().domain(UNIT_ORDER).range([0, height]).padding(0.2);
      const heatColorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(heatIDs);

      const xAxis = d3.axisBottom(xScale)
        .tickFormat(d3.timeFormat("%H:%M") as (d: Date | { valueOf(): number; }, i: number) => string)
        .ticks(d3.timeMinute.every(30));
        
      svg.append("g")
        .attr("class", "axis text-xs text-muted-foreground")
        .attr("transform", `translate(0,${height})`)
        .call(xAxis)
        .selectAll("path, line")
        .attr("stroke", "hsl(var(--border))");

      const yAxis = d3.axisLeft(yScale);
      svg.append("g")
        .attr("class", "axis text-xs text-muted-foreground")
        .call(yAxis)
        .selectAll("path, line")
        .attr("stroke", "hsl(var(--border))");

      const handleBarClick = (event: MouseEvent, d: any) => {
          event.stopPropagation(); // Prevent background click
          setSelectedHeatId(prevId => prevId === d.Heat_ID ? null : d.Heat_ID);
      }

      const mouseover = () => tooltipEl.style("opacity", 1);
      const mousemoveBar = (event: MouseEvent, d: any) => {
        tooltipEl.html(`
            <div class="font-bold">Mẻ: ${d.Heat_ID} (${d.Steel_Grade})</div>
            <div>Thiết bị: ${d.unit} (${d.group})</div>
            <hr class="my-1"/>
            <div>Bắt đầu: ${d.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <div>Kết thúc: ${d.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <div>Thời gian: ${d.Duration_min} phút</div>
        `)
        .style("left", (event.pageX + 15) + "px")
        .style("top", (event.pageY - 15) + "px");
      };
      
      const mousemoveLink = (event: MouseEvent, d: any) => {
        const idleMinutes = d.op2.idleTimeMinutes;
        tooltipEl.html(`
            <div class="font-bold">Mẻ: ${d.Heat_ID} (${d.Steel_Grade})</div>
            <div class="font-bold text-primary">Chuyển tiếp (Chờ)</div>
            <hr class="my-1"/>
            <div>Từ: ${d.op1.unit} (kết thúc ${d.op1.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</div>
            <div>Đến: ${d.op2.unit} (bắt đầu ${d.op2.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</div>
            ${idleMinutes > 0 ? `<div class="text-yellow-600">Thời gian chờ: ${idleMinutes} phút</div>` : ''}
        `)
        .style("left", (event.pageX + 15) + "px")
        .style("top", (event.pageY - 15) + "px");
      };

      const mouseleave = () => tooltipEl.style("opacity", 0);

      svg.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(linksData)
        .enter()
        .append("line")
        .attr("x1", d => xScale(d.op1.endTime))
        .attr("y1", d => (yScale(d.op1.unit) ?? 0) + yScale.bandwidth() / 2)
        .attr("x2", d => xScale(d.op2.startTime))
        .attr("y2", d => (yScale(d.op2.unit) ?? 0) + yScale.bandwidth() / 2)
        .attr("stroke", d => heatColorScale(d.Heat_ID))
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "3,3")
        .style("opacity", d => selectedHeatId === null || selectedHeatId === d.Heat_ID ? 1 : 0.2)
        .style("transition", "opacity 0.3s")
        .on("mouseover", mouseover)
        .on("mousemove", mousemoveLink)
        .on("mouseleave", mouseleave);

      svg.append("g")
        .selectAll("rect")
        .data(allOperations)
        .enter()
        .append("rect")
        .attr("x", d => xScale(d.startTime))
        .attr("y", d => yScale(d.unit)!)
        .attr("width", d => Math.max(0, xScale(d.endTime) - xScale(d.startTime)))
        .attr("height", yScale.bandwidth())
        .attr("fill", d => selectedHeatId === null || selectedHeatId === d.Heat_ID ? heatColorScale(d.Heat_ID) : "#cccccc")
        .attr("rx", 3)
        .attr("ry", 3)
        .style("opacity", d => selectedHeatId === null || selectedHeatId === d.Heat_ID ? 1 : 0.5)
        .style("cursor", "pointer")
        .style("transition", "fill 0.3s, opacity 0.3s")
        .on("click", handleBarClick)
        .on("mouseover", mouseover)
        .on("mousemove", mousemoveBar)
        .on("mouseleave", mouseleave);

      svg.append("g")
        .attr("class", "bar-labels")
        .selectAll("text")
        .data(allOperations)
        .enter()
        .append("text")
        .attr("x", d => xScale(d.startTime) + (xScale(d.endTime) - xScale(d.startTime)) / 2)
        .attr("y", d => (yScale(d.unit) ?? 0) + yScale.bandwidth() / 2)
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .text(d => {
            const barWidth = xScale(d.endTime) - xScale(d.startTime);
            const estimatedTextWidth = d.Heat_ID.length * 6;
            return (barWidth > estimatedTextWidth + 10) ? d.Heat_ID : "";
        })
        .attr("font-size", "11px")
        .attr("font-weight", 500)
        .attr("fill", "white")
        .style("pointer-events", "none")
        .style("opacity", d => selectedHeatId === null || selectedHeatId === d.Heat_ID ? 1 : 0.3);
        
      chartOutputEl.style.width = `${containerWidth}px`;
      chartOutputEl.style.overflowX = 'auto';

    };

    drawD3Gantt();

    const handleResize = _.debounce(() => {
        drawD3Gantt();
    }, 250);

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);

  }, [heats, timeRange, selectedHeatId]);


  if (heats.length === 0) {
    return (
      <div className="flex items-center justify-center h-[600px] text-muted-foreground">
        <p>Không có dữ liệu hợp lệ để hiển thị.</p>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        .d3-tooltip {
            position: absolute;
            background-color: hsl(var(--card));
            color: hsl(var(--card-foreground));
            border: 1px solid hsl(var(--border));
            border-radius: var(--radius);
            padding: 0.75rem;
            font-size: 0.875rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            z-index: 50;
        }
      `}</style>
      <div ref={chartContainerRef} className="w-full overflow-x-auto" />
      <div ref={tooltipRef} className="d3-tooltip" />
    </>
  );
}
