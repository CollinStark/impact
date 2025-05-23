import React from "react";
import dynamic from "next/dynamic";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });
import { Data, Layout } from "plotly.js";
import { lightPalette, colorBlindPalette } from "./colorPalettes";

import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/pagination";

import { Pagination } from "swiper/modules";

interface MidProps {
  experiment: string;
  condition: string;
  values: [number];
  err: [number];
}

interface MetaboliteData {
  name: string;
  mz: number | null;
  rt: number | null;
  mids: MidProps[];
}

interface MidPlotProps {
  data: MetaboliteData;
}

interface ExtendedLayout extends Partial<Layout> {
  [key: string]: any; // Allows indexing with any string
}

interface CustomStyle extends React.CSSProperties {
  "--swiper-pagination-bullet-size"?: string;
}

const MidPlot: React.FC<MidPlotProps> = ({ data }) => {
  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    adaptiveHeight: true,
  };

  const processData: (data: MidProps[]) => {
    plotData: Data[];
    numValues: number;
  } = (data) => {
    const experiments = [...new Set(data.map((item) => item.experiment))];
    const numValues = Math.max(...data.map((d) => d.values.length));
    const plotData: Data[] = [];

    const colors = colorBlindPalette[experiments.length];
    experiments.forEach((experiment, expIndex) => {
      for (let i = 0; i < numValues; i++) {
        const x: string[] = [];
        const y: number[] = [];
        const error_y = {
          array: [] as number[],
          visible: true,
          type: "data" as const,
        };

        data.forEach((item) => {
          if (item.experiment === experiment && item.values[i] !== undefined) {
            x.push(`${item.condition}`);
            y.push(item.values[i]);
            error_y.array.push(item.err[i] || 0);
          }
        });

        const plot = {
          x,
          y,
          error_y,
          type: "bar" as const,
          name: experiment,
          legendgroup: `group${experiment}`,
          marker: { color: colors[expIndex % colors.length] },
          xaxis: `x${i + 1}`,
          yaxis: `y${i + 1}`,
          showlegend: true,
        };
        if (i !== 0) {
          plot.showlegend = false;
        }
        plotData.push(plot);
      }
    });

    return { plotData, numValues };
  };

  const { plotData, numValues } = processData(data.mids);

  const layoutFixed: ExtendedLayout = {
    width: 425,
    grid: { rows: numValues, columns: 1, pattern: "independent" },
    barmode: "group",
    title: "MIDs (Fixed)",
    margin: {
      l: 40, // Left margin
      r: 20, // Right margin
      t: 40, // Top margin
      b: 10, // Bottom margin
    },
    legend: {
      orientation: "h",
      x: 0.5,
      xanchor: "center",
      y: -0.075,
      yanchor: "top",
    },
  };
  // Generate axis titles
  for (let i = 1; i <= numValues; i++) {
    layoutFixed[`xaxis${i}`] = { showticklabels: false };
    layoutFixed[`yaxis${i}`] = { title: `M+${i - 1}`, range: [0, 1] };

    if (i === numValues) {
      layoutFixed[`xaxis${i}`] = { showticklabels: true };
    }
  }

  const layout: ExtendedLayout = {
    width: 425,
    grid: { rows: numValues, columns: 1, pattern: "independent" },
    barmode: "group",
    title: "MIDs (Zoomed)",
    margin: {
      l: 40, // Left margin
      r: 20, // Right margin
      t: 40, // Top margin
      b: 10, // Bottom margin
    },
    legend: {
      orientation: "h",
      x: 0.5,
      xanchor: "center",
      y: -0.075,
      yanchor: "top",
    },
  };
  // Generate axis titles
  for (let i = 1; i <= numValues; i++) {
    layout[`xaxis${i}`] = { showticklabels: false };
    layout[`yaxis${i}`] = { title: `M+${i - 1}` };

    if (i === numValues) {
      layout[`xaxis${i}`] = { showticklabels: true };
    }
  }

  const processDataStacked: (data: MidProps[]) => {
    plotDataStack: Data[];
    experimentsStack: string[];
  } = (data) => {
    const experimentsStack = [...new Set(data.map((item) => item.experiment))];
    const conditions = [...new Set(data.map((item) => item.condition))];
    const numValues = Math.max(...data.map((d) => d.values.length));

    const colors = lightPalette[15];

    const plotDataStack: Data[] = [];

    for (let i = 0; i < numValues; i++) {
      experimentsStack.forEach((experiment, expIndex) => {
        const y = new Array(conditions.length).fill(0);
        const error_y = {
          array: new Array(conditions.length).fill(0),
          visible: true,
          type: "data" as const,
        };

        data.forEach((item) => {
          if (item.experiment === experiment && item.values[i] !== undefined) {
            const conditionIndex = conditions.indexOf(item.condition);
            y[conditionIndex] += item.values[i];
            error_y.array[conditionIndex] = item.err[i] || 0;
          }
        });

        const plot = {
          x: conditions,
          y: y,
          error_y: error_y,
          type: "bar" as const,
          name: `M+${i}`,
          legendgroup: `group${i}`,
          marker: { color: colors[i % colors.length] },
          xaxis: `x${expIndex + 1}`,
          yaxis: `y${expIndex + 1}`,
          showlegend: expIndex === 0,
        };

        plotDataStack.push(plot);
      });
    }

    return { plotDataStack, experimentsStack };
  };

  const { plotDataStack, experimentsStack } = processDataStacked(data.mids);
  const layoutStack: ExtendedLayout = {
    width: 425,
    barmode: "stack",
    title: "Stacked MIDs",
    grid: { rows: experimentsStack.length, columns: 1, pattern: "independent" },
    showlegend: true,
    margin: {
      l: 40, // Left margin
      r: 20, // Right margin
      t: 40, // Top margin
      b: 10, // Bottom margin
    },
    legend: {
      traceorder: "normal",
      orientation: "h",
      x: 0.5,
      xanchor: "center",
      y: -0.075,
      yanchor: "top",
    },
  };

  experimentsStack.forEach((experiment, index) => {
    layoutStack[`xaxis${index + 1}`] = {
      showticklabels: false,
      tickangle: -45,
    };
    layoutStack[`yaxis${index + 1}`] = { title: experiment };
    if (index + 1 === experimentsStack.length) {
      layoutStack[`xaxis${index + 1}`] = {
        showticklabels: true,
        tickangle: -45,
      };
    }
  });

  const swiperStyle: CustomStyle = {
    "--swiper-pagination-bullet-size": "12px",
  };

  return (
    <div style={{ maxWidth: "22vw", width: "100%" }}>
      <Swiper
        allowTouchMove={false}
        pagination={{
          clickable: true,
          dynamicBullets: true,
        }}
        modules={[Pagination]}
        style={swiperStyle}
      >
        <SwiperSlide>
          <Plot
            data={plotData}
            layout={layoutFixed}
            config={{ displayModeBar: false }}
          />
        </SwiperSlide>
        <SwiperSlide>
          <Plot
            data={plotData}
            layout={layout}
            config={{ displayModeBar: false }}
          />
        </SwiperSlide>
        <SwiperSlide>
          <Plot
            data={plotDataStack}
            layout={layoutStack}
            config={{ displayModeBar: false }}
          />
        </SwiperSlide>
      </Swiper>
    </div>
  );
};

export default MidPlot;
