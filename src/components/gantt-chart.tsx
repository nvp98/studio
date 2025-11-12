
"use client";

import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { GanttHeat } from '@/lib/types';
import _ from 'lodash';
import type { TimeRange } from '@/app/page';
import { format } from 'date-fns';

interface GanttChartProps {
  data: GanttHeat[];
  timeRange: TimeRange;
  onHeatSelect: (heatId: string | null) => void;
  selectedHeatId: string | null;
  unitOrder: string[];
}

const CASTER_COLORS: { [key: string]: string } = {
    TSC1: "#41A67E",
    TSC2: "#05339C",
    BCM1: "#43A047",
    BCM2: "#FB8C00",
    BCM3: "#E53935",
};

function getColor(caster: string | undefined): { bg: string; text: string } {
    const bgColor = caster ? CASTER_COLORS[caster] ?? '#cccccc' : '#cccccc';
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    const textColor = brightness > 150 ? '#0A0A0A' : '#FFFFFF';
    return { bg: bgColor, text: textColor };
}

export function GanttChart({ data: heats, timeRange, onHeatSelect, selectedHeatId, unitOrder }: GanttChartProps) {
  const yAxisRef = useRef<SVGSVGElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartSvgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!chartSvgRef.current) return;
    const svg = d3.select(chartSvgRef.current);
    
    svg.selectAll("rect.bar, g.bar-label")
       .transition().duration(300)
       .style("opacity", (d: any) => selectedHeatId === null || d.Heat_ID === selectedHeatId ? 1 : 0.45);

    svg.selectAll("line.link")
        .transition().duration(300)
        .style("opacity", (d: any) => selectedHeatId !== null && d.Heat_ID === selectedHeatId ? 0.9 : 0.3)
        .attr("stroke-width", (d: any) => selectedHeatId !== null && d.Heat_ID === selectedHeatId ? 2 : 1.5);
  }, [selectedHeatId, heats]);

  useEffect(() => {
    if (!chartContainerRef.current || !tooltipRef.current || !yAxisRef.current) return;
    
    const cleanup = () => {
        d3.select(chartContainerRef.current).select("svg").remove();
        d3.select(yAxisRef.current).selectAll("*").remove();
    };

    if (heats.length === 0) {
        cleanup();
        return;
    }

    const drawD3Gantt = () => {
      cleanup();
      
      const chartOutputEl = chartContainerRef.current!;
      const yAxisEl = yAxisRef.current!;
      const tooltipEl = d3.select(tooltipRef.current);

      const allOpsWithHeatInfo = heats.flatMap(heat => 
        heat.operations.map(op => ({
            ...op,
            Heat_ID: heat.Heat_ID,
            Steel_Grade: heat.Steel_Grade,
            castingMachine: heat.castingMachine,
            sequenceInCaster: heat.sequenceInCaster,
        }))
      ).sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
      
      if (allOpsWithHeatInfo.length === 0) return;

      const { minTime, maxTime } = allOpsWithHeatInfo.reduce((acc, op) => ({
          minTime: d3.min([acc.minTime, op.startTime])!,
          maxTime: d3.max([acc.maxTime, op.endTime])!,
      }), { minTime: allOpsWithHeatInfo[0].startTime, maxTime: allOpsWithHeatInfo[0].endTime });

      const linksData = heats.flatMap(heat => {
        const sortedOps = _.sortBy(heat.operations, 'startTime');
        const links = [];
        for (let i = 0; i < sortedOps.length - 1; i++) {
            links.push({ 
                Heat_ID: heat.Heat_ID, 
                op1: sortedOps[i], 
                op2: sortedOps[i+1] 
            });
        }
        return links;
      });

      const fullTimeDomainStart = d3.timeMinute.offset(minTime, -15);
      const fullTimeDomainEnd = d3.timeMinute.offset(maxTime, 15);
      
      const margin = { top: 30, right: 40, bottom: 50, left: 0 }; // left margin is handled by y-axis container
      const yAxisWidth = 60;
      const containerWidth = chartOutputEl.clientWidth;
      const barHeight = 28;
      const barPadding = 8;
      const height = unitOrder.length * (barHeight + barPadding);
      
      const totalTimeMinutes = (fullTimeDomainEnd.getTime() - fullTimeDomainStart.getTime()) / 60000;
      const visibleTimeMinutes = timeRange * 60;
      const width = Math.max(containerWidth, containerWidth * (totalTimeMinutes / visibleTimeMinutes));

      const chartSvgElement = d3.select(chartOutputEl)
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .on("click", (event) => {
            if (event.target === event.currentTarget) {
                onHeatSelect(null);
            }
        });
      
      chartSvgRef.current = chartSvgElement.node();

      const chartSvg = chartSvgElement.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      const xScale = d3.scaleTime().domain([fullTimeDomainStart, fullTimeDomainEnd]).range([0, width]);
      const yScale = d3.scaleBand().domain(unitOrder).range([0, height]).paddingInner(barPadding / (barHeight + barPadding)).paddingOuter(0.2);

      // --- Draw Y-Axis in its own SVG ---
      const yAxisSvg = d3.select(yAxisEl)
          .attr("width", yAxisWidth)
          .attr("height", height + margin.top + margin.bottom)
          .append("g")
          .attr("transform", `translate(${yAxisWidth - 1},${margin.top})`); // Position it to the right edge

      const yAxis = d3.axisLeft(yScale);
      yAxisSvg.append("g")
        .attr("class", "axis text-xs text-muted-foreground")
        .call(yAxis)
        .call(g => g.select(".domain").remove()) // remove domain line
        .selectAll("line").remove(); // remove ticks
      // --- End Y-Axis Drawing ---

      const grid = chartSvg.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).ticks(d3.timeMinute.every(30)).tickSize(-height).tickFormat(() => ""));
      
      grid.selectAll("line").attr("stroke", "hsl(var(--border))").style("opacity", 0.5);
      grid.select(".domain").remove();

      const xAxis = d3.axisBottom(xScale)
        .tickFormat(d3.timeFormat("%H:%M") as (d: Date | { valueOf(): number; }, i: number) => string)
        .ticks(d3.timeHour.every(1));
        
      chartSvg.append("g")
        .attr("class", "axis text-xs text-muted-foreground")
        .attr("transform", `translate(0,${height})`)
        .call(xAxis)
        .selectAll("path, line")
        .attr("stroke", "hsl(var(--border))");
        
      const dateAxis = d3.axisBottom(xScale)
        .ticks(d3.timeDay.every(1))
        .tickFormat(d3.timeFormat("%d/%m/%Y") as (d: Date | { valueOf(): number; }, i: number) => string);

      chartSvg.append("g")
        .attr("class", "axis date-axis text-xs text-muted-foreground")
        .attr("transform", `translate(0, ${height + 25})`)
        .call(dateAxis)
        .call(g => g.select(".domain").remove())
        .selectAll("line").remove();

      const handleBarClick = (event: MouseEvent, d: any) => {
          event.stopPropagation();
          const newSelectedId = selectedHeatId === d.Heat_ID ? null : d.Heat_ID;
          onHeatSelect(newSelectedId);
      }

      const mouseover = () => tooltipEl.style("opacity", 1);
      const mousemove = (event: MouseEvent, content: string) => {
        tooltipEl.html(content)
        .style("left", (event.pageX + 15) + "px")
        .style("top", (event.pageY - 15) + "px");
      };
      const mouseleave = () => tooltipEl.style("opacity", 0);

      chartSvg.append("g")
        .selectAll("line.link")
        .data(linksData)
        .enter()
        .append("line")
        .attr("class", "link")
        .attr("x1", d => xScale(d.op1.endTime))
        .attr("y1", d => (yScale(d.op1.unit) ?? 0) + yScale.bandwidth() / 2)
        .attr("x2", d => xScale(d.op2.startTime))
        .attr("y2", d => (yScale(d.op2.unit) ?? 0) + yScale.bandwidth() / 2)
        .attr("stroke", "hsl(var(--foreground))")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "5,3")
        .style("opacity", 0.3) 
        .style("pointer-events", "none");

      chartSvg.append("g")
        .selectAll("rect.bar")
        .data(allOpsWithHeatInfo)
        .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", d => xScale(d.startTime))
        .attr("y", d => yScale(d.unit)!)
        .attr("width", d => Math.max(1, xScale(d.endTime) - xScale(d.startTime)))
        .attr("height", yScale.bandwidth())
        .attr("fill", d => getColor(d.castingMachine).bg)
        .attr("stroke", "hsl(var(--card-foreground))")
        .attr("stroke-width", 0.5)
        .attr("rx", 6)
        .attr("ry", 6)
        .style("cursor", "pointer")
        .on("click", handleBarClick)
        .on("mouseover", mouseover)
        .on("mousemove", (event, d) => mousemove(event, `
            <div class="font-bold">Mẻ: ${d.Heat_ID} (#${d.sequenceInCaster})</div>
            <div>Thiết bị: ${d.unit}</div>
            <hr class="my-1"/>
            <div>Bắt đầu: ${format(d.startTime, 'HH:mm dd/MM')}</div>
            <div>Kết thúc: ${format(d.endTime, 'HH:mm dd/MM')}</div>
            <div>Thời gian: ${d.Duration_min} phút</div>
        `))
        .on("mouseleave", mouseleave);

      const labels = chartSvg.append("g")
        .selectAll("g.bar-label")
        .data(allOpsWithHeatInfo)
        .enter()
        .append("g")
        .attr("class", "bar-label")
        .attr("transform", d => `translate(${xScale(d.startTime) + 8}, ${(yScale(d.unit) ?? 0) + yScale.bandwidth() / 2})`)
        .style("pointer-events", "none");
        
      labels.append("text")
        .attr("class", "heat-id-label")
        .attr("alignment-baseline", "middle")
        .text(d => d.Heat_ID)
        .attr("font-size", "12px")
        .attr("font-weight", 500)
        .attr("fill", d => getColor(d.castingMachine).text);

      labels.append("text")
        .attr("class", "sequence-label")
        .attr("alignment-baseline", "middle")
        .text(d => d.group === 'CASTER' ? ` (#${d.sequenceInCaster})` : '')
        .attr("font-size", "12px")
        .attr("font-weight", 400)
        .attr("fill", d => getColor(d.castingMachine).text)
        .attr("dx", d => (d.Heat_ID.length * 7));

      labels.style("opacity", function(d) {
          const barWidth = xScale(d.endTime) - xScale(d.startTime);
          const labelWidth = this.getBBox().width + 16;
          return barWidth > labelWidth ? 1 : 0;
      });
        
      chartOutputEl.style.width = `${containerWidth - yAxisWidth}px`;
      chartOutputEl.style.overflowX = 'auto';
    };

    const scrollLeft = chartContainerRef.current?.scrollLeft;
    drawD3Gantt();
    if(chartContainerRef.current && scrollLeft) {
      chartContainerRef.current.scrollLeft = scrollLeft;
    }

    const handleResize = _.debounce(() => {
        drawD3Gantt();
    }, 250);

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);

  }, [heats, timeRange, unitOrder]);

  return (
    <div className="flex w-full">
      <style jsx global>{`
        .d3-tooltip {
            position: absolute;
            background-color: hsl(var(--card));
            color: hsl(var(--card-foreground));
            border: 1px solid hsl(var(--border));
            border-radius: 8px;
            padding: 8px;
            font-size: 0.875rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            z-index: 50;
        }
        .date-axis .tick text {
            font-weight: 600;
        }
        .bar {
            transition: fill 0.3s ease, opacity 0.3s ease;
        }
        .bar-label {
            transition: opacity 0.3s ease;
        }
        .link {
            transition: opacity 0.3s ease, stroke-width 0.3s ease;
        }
        .axis .tick text {
            text-anchor: end;
        }
      `}</style>
      <div className="sticky left-0 bg-card z-10 border-r">
          <svg ref={yAxisRef}></svg>
      </div>
      <div ref={chartContainerRef} className="flex-grow overflow-x-auto" />
      <div ref={tooltipRef} className="d3-tooltip" />
    </div>
  );
}


    
    