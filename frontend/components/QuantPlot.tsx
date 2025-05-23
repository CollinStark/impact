import React from "react";
import dynamic from "next/dynamic";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });
import { colorBlindPalette } from "./colorPalettes";
import { Data } from "plotly.js";

import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/pagination";

import { Pagination } from "swiper/modules";

interface QuantProps {
  value: [number];
  err: [number];
  experiment: string;
}

interface FractionalContribution {
  value: [number];
  experiment: string;
}

interface MetaboliteData {
  name: string;
  mz: number | null;
  rt: number | null;
  quantification: QuantProps[];
  fc: FractionalContribution[];
  fc_pool: FractionalContribution[];
}

interface QuantPlotProps {
  data: MetaboliteData;
}

interface CustomStyle extends React.CSSProperties {
  "--swiper-pagination-bullet-size"?: string;
}

interface CustomPlotProps {
  data: Data[];
  title: string;
}

const QuantPlot: React.FC<QuantPlotProps> = ({ data }) => {
  const experiments = [
    ...new Set(data.quantification.map((item) => item.experiment)),
  ];
  const colors = colorBlindPalette[experiments.length];

  const traces: Data[] = data.quantification.map((item, index) => {
    return {
      type: "scatter",
      mode: "lines+markers",
      name: item.experiment,
      x: [...Array(item.value.length).keys()], // Creating an array [0, 1, 2, ..., n]
      y: item.value,
      error_y: {
        type: "data",
        array: item.err,
        visible: true,
      },
      marker: {
        size: 8,
        color: colors[index % colors.length],
      },
    };
  });

  const tracesFc: Data[] = data.fc.map((item, index) => {
    return {
      type: "scatter",
      mode: "lines+markers",
      name: item.experiment,
      x: [...Array(item.value.length).keys()], // Creating an array [0, 1, 2, ..., n]
      y: item.value,

      marker: {
        size: 8,
        color: colors[index % colors.length],
      },
    };
  });

  const tracesPoolFc: Data[] = data.fc_pool.map((item, index) => {
    return {
      type: "scatter",
      mode: "lines+markers",
      name: item.experiment,
      x: [...Array(item.value.length).keys()], // Creating an array [0, 1, 2, ..., n]
      y: item.value,

      marker: {
        size: 8,
        color: colors[index % colors.length],
      },
    };
  });

  const CustomPlot: React.FC<CustomPlotProps> = ({ data, title }) => (
    <Plot
      data={data}
      layout={{
        width: 425,
        title: title,
        xaxis: {
          title: "Condition",
          tickmode: "linear",
          tick0: 0,
          dtick: 1,
        },
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
          y: -0.15,
          yanchor: "top",
        },
      }}
      config={{
        displayModeBar: false, // This will hide the mode bar
      }}
    />
  );

  const swiperStyle: CustomStyle = {
    "--swiper-pagination-bullet-size": "12px",
  };

  return (
    <div>
      {data.quantification && (
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
              <CustomPlot data={traces} title="Pool Sizes" />
            </SwiperSlide>
            <SwiperSlide>
              <CustomPlot data={tracesFc} title="Fractional Contribution" />
            </SwiperSlide>
            <SwiperSlide>
              <CustomPlot data={tracesPoolFc} title="Pool * FC" />
            </SwiperSlide>
          </Swiper>
        </div>
      )}
    </div>
  );
};

export default QuantPlot;
