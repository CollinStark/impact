"use client";

import React, { useState, ChangeEvent, FormEvent, useEffect } from "react";
import dynamic from "next/dynamic";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });
import { Data } from "plotly.js";
import axios from "axios";
import api from "../app/baseApi";
import { FaInfoCircle } from "react-icons/fa";
import Papa from "papaparse";
import Select from "react-select";

import { lightPalette, colorBlindPalette } from "./colorPalettes";

interface MetaboliteData {
  condition: string;
  mean: number;
  std: number;
  experiment: string;
  metabolite: string;
  isotopomer: string;
}

interface UploadResponse {
  filename: string;
  data: { [metaboliteName: string]: MetaboliteData[] };
}

interface CsvRow {
  condition: string;
}

const FileUploadForm: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [ctrlCondition, setCtrlCondition] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [data, setData] = useState<UploadResponse | null>(null);

  const [selectedMetabolite, setSelectedMetabolite] = useState<string | null>(
    null
  );
  const [selectedExperiment, setSelectedExperiment] = useState<string | null>(
    null
  );
  const [metaboliteNames, setMetaboliteNames] = useState<string[]>([]);
  const [experiments, setExperiments] = useState<string[]>([]);

  const [conditions, setConditions] = useState([]);

  useEffect(() => {
    if (data) {
      setMetaboliteNames(Object.keys(data.data));
      setSelectedMetabolite(Object.keys(data.data)[0]);

      setExperiments(Object.keys(data.data[Object.keys(data.data)[0]]));
      setSelectedExperiment(
        Object.keys(data.data[Object.keys(data.data)[0]])[0]
      );
    }
  }, [data]);

  const handleMidFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith(".csv")) {
        setFile(file);
        setErrorMessage(null);

        Papa.parse(file, {
          header: true, // Use header row to identify columns
          complete: (result) => {
            const conditionsSet = new Set<string>();
            const conditionsColumnName = "condition"; // The expected column name for conditions

            // Check if the conditions column exists in the headers
            if (
              result.meta.fields &&
              result.meta.fields.includes(conditionsColumnName)
            ) {
              result.data.forEach((row) => {
                const typedRow = row as CsvRow;
                if (typedRow.condition) {
                  conditionsSet.add(typedRow.condition);
                }
              });

              // Update conditions with the new set
              const newConditions = Array.from(conditionsSet);
              setConditions(
                newConditions.map((condition) => ({
                  value: condition,
                  label: condition,
                }))
              );
            } else {
              // Handle the case where the conditions column is not found
              console.error("Condition column not found in the CSV file.");
              setErrorMessage(
                "Condition column not found. Please include a 'condition' column in your CSV file."
              );
            }
          },
          skipEmptyLines: true,
        });
      } else {
        setErrorMessage("Please upload a CSV file.");
      }
    }
  };

  const validateFile = (): boolean => {
    if (!file) {
      setErrorMessage("Please select a file to upload.");
      return false;
    }

    const allowedTypes = ["text/plain", "text/csv"];
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage("Please select a valid text or CSV file.");
      return false;
    }

    const maxSizeInBytes = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSizeInBytes) {
      setErrorMessage(
        "File size exceeds the limit (5MB). Please choose a smaller file."
      );
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setErrorMessage(null);
    setSuccessMessage(null);

    if (!validateFile()) {
      setIsLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append("file", file as Blob);
    if (ctrlCondition) {
      formData.append("ctrlCondition", ctrlCondition.toString());
    } else {
      setErrorMessage(
        "Please select a control condition to proceed with the calculation."
      );
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.post("api/targeted/upload", formData);
      if (response.status === 200) {
        setData(response.data);
        setSuccessMessage("File uploaded successfully.");
      } else {
        setErrorMessage("Failed to upload the file.");
      }
    } catch (error) {
      console.error("Error uploading the file:", error.response.data.detail);
      setErrorMessage(error.response.data.detail);
    }
    setIsLoading(false);
  };

  const handleMetaboliteChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setSelectedMetabolite(e.target.value);
  };

  const handleExperimentChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setSelectedExperiment(e.target.value);
  };

  const handleDownloadCSV = () => {
    if (data) {
      // Updated CSV header to include new fields
      const csvHeader = "metabolite,experiment,condition,isotopomer,mean,std\n";

      const csvContent =
        csvHeader +
        Object.entries(data.data) // Iterate over the first level (metabolite)
          .flatMap(([metabolite, experiments]) =>
            Object.entries(experiments).flatMap(
              ([experiment, experimentData]) =>
                experimentData.map(
                  (item) =>
                    `${metabolite},${experiment},${item.condition},${item.isotopomer},${item.mean},${item.std}`
                )
            )
          )
          .join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      // Assuming `data.filename` exists and is appropriate for use here
      link.download = data.filename
        ? `${data.filename.split(".")[0]}_mids.csv`
        : "exported_data_mids.csv";
      document.body.appendChild(link); // Append link to body to ensure visibility in all browsers
      link.click();
      document.body.removeChild(link); // Clean up by removing the link
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMessage && <div className="text-error">{errorMessage}</div>}
      {!data && (
        <>
          <input
            type="file"
            id="file"
            accept=".txt,.csv"
            onChange={handleMidFileChange}
            className="file-input file-input-bordered w-full max-w-xs"
          />
          <div className="form-group">
            <label className="form-label">
              Control Condition
              <span
                className="tooltip ml-1"
                data-tip="Condition to use as unlabeled for MID calculation."
              >
                <FaInfoCircle />
              </span>
            </label>
            <Select
              name="ctrlCondition"
              id="ctrl-condition-select"
              instanceId="ctrl-condition-select"
              options={conditions}
              className="basic-multi-select"
              classNamePrefix="select"
              placeholder="Select control condition..."
              value={
                ctrlCondition
                  ? { value: ctrlCondition, label: ctrlCondition }
                  : null
              }
              onChange={(option) => {
                setCtrlCondition(option.value);
              }}
            />
          </div>

          <div className="form-group flex items-center">
            <input
              type="checkbox"
              id="terms"
              checked={agreedToTerms}
              onChange={() => setAgreedToTerms(!agreedToTerms)}
              className="checkbox"
            />
            <label htmlFor="terms" className="ml-2 text-sm">
              This tool is freely available for academic, research, and
              non-commercial purposes. Commercial entities, including for-profit
              organizations, are prohibited from using the Target Analysis, MID
              Calculation, and Contextualization tools.
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-success"
            disabled={!agreedToTerms}
          >
            Submit
          </button>
          {isLoading && (
            <span className=" center loading loading-spinner loading-md ml-1"></span>
          )}
        </>
      )}
      {data && selectedMetabolite && (
        <div>
          <div className="flex justify-between  mt-4">
            <div className="mb-4">
              <label htmlFor="metaboliteSelect" className="block font-medium">
                Select a metabolite:
              </label>
              <select
                id="metaboliteSelect"
                onChange={handleMetaboliteChange}
                value={selectedMetabolite}
                className="select select-bordered w-full max-w-xs"
              >
                {metaboliteNames.map((metaboliteName) => (
                  <option key={metaboliteName} value={metaboliteName}>
                    {metaboliteName}
                  </option>
                ))}
              </select>
              <label htmlFor="metaboliteSelect" className="block font-medium">
                Select an experiment:
              </label>
              <select
                id="experimentSelect"
                onChange={handleExperimentChange}
                value={selectedExperiment}
                className="select select-bordered w-full max-w-xs"
              >
                {experiments.map((experiment) => (
                  <option key={experiment} value={experiment}>
                    {experiment}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownloadCSV}
            >
              Download CSV
            </button>
          </div>

          <Plot
            data={generateBarChartData(
              data,
              selectedMetabolite,
              selectedExperiment
            )}
            layout={{
              width: 1500,
              height: 750,
              title: `MIDs: ${selectedMetabolite} ${selectedExperiment}`,
              xaxis: {
                title: "Isotopomer",
              },
              yaxis: {
                title: "Value",
              },
              barmode: "group", // Set the barmode to "group" to display grouped bars
            }}
            config={{
              displayModeBar: true, // This will hide the mode bar
              modeBarButtonsToRemove: [
                "zoom2d",
                "pan2d",
                "select2d",
                "lasso2d",
                "zoomIn2d",
                "zoomOut2d",
                "autoScale2d",
                "resetScale2d",
                "hoverClosestCartesian",
                "hoverCompareCartesian",
                "toggleSpikelines",
                "resetViews",
                "sendDataToCloud",
                "toggleHover",
              ],
              displaylogo: false, // Hide Plotly logo
            }}
          />
        </div>
      )}
    </form>
  );
};

function generateBarChartData(
  data: UploadResponse,
  selectedMetabolite: string,
  selectedExperiment: string
) {
  const metaboliteData = data.data[selectedMetabolite];
  const experimentData = metaboliteData[selectedExperiment];

  // Group data by condition
  const groupedData: { [condition: string]: MetaboliteData[] } = {};
  experimentData.forEach((item) => {
    if (!groupedData[item.condition]) {
      groupedData[item.condition] = [];
    }
    groupedData[item.condition].push(item);
  });

  // Create an array of traces for each condition
  const totalCount = Object.keys(groupedData).length;
  const colors = colorBlindPalette[totalCount];
  const traces: Data[] = Object.keys(groupedData)
    .sort((a, b) => {
      const conditionA = parseInt(a.slice(1));
      const conditionB = parseInt(b.slice(1));
      return conditionA - conditionB;
    })
    .map((condition, index) => ({
      x: groupedData[condition].map((item) => item.isotopomer),
      y: groupedData[condition].map((item) => item.mean),
      error_y: {
        type: "data",
        array: groupedData[condition].map((item) => item.std),
        visible: true,
      },
      type: "bar",
      name: condition, // Use condition as the trace name (will be used for the legend)
      marker: {
        color: colors[index % colors.length],
      },
    }));

  return traces;
}

// Function to generate a gradient color based on a given index and total count
function generateGradientColor(index: number, totalCount: number) {
  const colorVec = [
    "#ece7f2",
    "#9caac2",
    "#69849f",
    "#355e7b",
    "#c43b44",
    "#d87663",
    "#ebb181",
  ];

  const mixColor = (start: string, end: string, scale: number) => {
    const hexToRgb = (hex: string) => {
      const result = hex
        .replace(
          /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
          (_, r, g, b) => "#" + r + r + g + g + b + b
        )
        .substring(1)
        .match(/.{2}/g);

      if (!result) {
        throw new Error(`Invalid hex color: ${hex}`);
      }

      return result.map((x) => parseInt(x, 16));
    };

    const rgbToHex = (rgb: number[]) =>
      "#" +
      rgb.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");

    const startRgb = hexToRgb(start);
    const endRgb = hexToRgb(end);

    const rgb = startRgb.map((startVal, i) => {
      return Math.round(startVal + scale * (endRgb[i] - startVal));
    });

    return rgbToHex(rgb);
  };

  const colorScale = index / (totalCount - 1); // Scale the index to be between 0 and 1

  if (colorScale >= 1) {
    return colorVec[colorVec.length - 1];
  } else {
    const interval = 1 / (colorVec.length - 1);
    const startIndex = Math.floor(colorScale / interval);
    const endIndex = startIndex + 1;
    const scale = (colorScale % interval) / interval;
    return mixColor(colorVec[startIndex], colorVec[endIndex], scale);
  }
}
export default FileUploadForm;
