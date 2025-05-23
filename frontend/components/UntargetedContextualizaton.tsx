"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import api from "@/app/baseApi";
import { saveToIndexedDB } from "@/app/indexedDB";
import { useRouter, useSearchParams } from "next/navigation";
import { FaInfoCircle } from "react-icons/fa";
import Papa from "papaparse";
import Select from "react-select";

interface Variability {
  c1: string;
  c2: string;
  condition: string;
  p_m0: number;
}

interface Quantification {
  value: number[];
  err: number[];
  experiment: string;
}

interface NodeData {
  name: string;
  id: string;
  node_id: string | null;
  mz: number;
  rt: number;
  variability: Variability[];
  quantification: Quantification[];
  mids: any[]; // Define this more specifically based on your data structure
  pool_variability: number;
  fc_variability: number;
  type: string;
  fc: any[]; // Define this more specifically based on your data structure
  fc_pool: any[]; // Define this more specifically based on your data structure
}

interface EdgeData {
  source: string;
  target: string;
  distance: number;
  zscore: number;
  experiment: string;
  condition: string;
}

interface GraphElement {
  data: NodeData | EdgeData;
  position?: { x: number | null; y: number | null };
}

interface NetworkGraph {
  nodes: GraphElement[];
  edges: GraphElement[];
}

interface CsvRow {
  condition: string;
}

const UntargetedContextualizaton = () => {
  const [agreedToTerms, setAgreedToTerms] = useState<boolean>(false);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [pathwayFile, setPathwayFile] = useState<File | null>(null);

  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [sumThreshold, setSumThreshold] = useState(0.2);
  const [minLabel, setMinLabel] = useState(0.15);
  const [minCarbon, setMinCarbon] = useState(2);
  const [minQuant, setMinQuant] = useState(500);
  const [m0Threshold, setM0Threshold] = useState(0.9);

  const [conditions, setConditions] = useState<string[]>([]);
  const [excludedConditions, setExcludedConditions] = useState<string[]>([]);
  const [unlabeledConditions, setUnlabeledConditions] = useState<string[]>([]);

  const router = useRouter();

  const predefinedConditionOptions = [
    { value: "Control", label: "Control" },
    { value: "T0", label: "T0" },
    { value: "T1", label: "T1" },
  ];

  const conditionOptions =
    conditions.length > 0
      ? conditions.map((condition) => ({ value: condition, label: condition }))
      : predefinedConditionOptions;

  const handleMidFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith(".csv")) {
        setCsvFile(file);
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
              setConditions(newConditions);

              // Remove any excluded conditions not present in the new conditions
              const updatedExcludedConditions = excludedConditions.filter(
                (condition) => conditionsSet.has(condition)
              );
              setExcludedConditions(updatedExcludedConditions);

              const updatedUnlabeledConditions = unlabeledConditions.filter(
                (condition) => conditionsSet.has(condition)
              );
              setUnlabeledConditions(updatedUnlabeledConditions);
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

  const handlePathwayFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // Validate file extension (CSV)
      if (selectedFile.name.endsWith(".json")) {
        setPathwayFile(selectedFile);
        setErrorMessage(null);
      } else {
        setErrorMessage("Please upload a JSON file for the pathway.");
      }
    }
  };

  const handleSubmit = async () => {
    if (!csvFile) {
      setErrorMessage("Please select a CSV file.");
      return;
    }
    setIsLoading(true);
    const formData = new FormData();
    formData.append("csvFile", csvFile);

    if (pathwayFile) {
      formData.append("pathwayFile", pathwayFile);
    }

    formData.append("sumThreshold", sumThreshold.toString());
    formData.append("minLabel", minLabel.toString());
    formData.append("minCarbon", minCarbon.toString());
    formData.append("minQuant", minQuant.toString());
    formData.append("m0Threshold", m0Threshold.toString());

    formData.append("excludedConditions", excludedConditions.toString());
    formData.append("unlabeledConditions", unlabeledConditions.toString());

    if (sessionId) {
      formData.append("sessionId", sessionId.toString());
    } else {
      formData.append("sessionId", "");
    }

    try {
      const response = await api.post(
        "api/untargeted/contextualization",
        formData
      );

      router.push(`/share/${response.data.session_id}`);
      setIsLoading(false);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        // Handle API errors
        if (error.response) {
          console.log(error);
          setErrorMessage(
            error.response.data.detail ||
              "An error occurred while processing the file."
          );
        } else {
          setErrorMessage("An unexpected error occurred.");
        }
        setIsLoading(false);
      }
    }
  };

  // Type guard for NodeData
  function isNodeData(data: NodeData | EdgeData): data is NodeData {
    return (data as NodeData).id !== undefined;
  }

  // Type guard for EdgeData
  function isEdgeData(data: NodeData | EdgeData): data is EdgeData {
    return (
      (data as EdgeData).source !== undefined &&
      (data as EdgeData).target !== undefined
    );
  }

  const validateNetworkGraph = (graph: NetworkGraph): string | null => {
    if (
      !graph.nodes ||
      !Array.isArray(graph.nodes) ||
      !graph.edges ||
      !Array.isArray(graph.edges)
    ) {
      return "Graph must contain nodes and edges arrays.";
    }

    for (const node of graph.nodes) {
      if (
        !node.data ||
        typeof node.data !== "object" ||
        !isNodeData(node.data)
      ) {
        return "Each node must have a data object with an id string.";
      }
      // Add additional node-specific validations here
    }

    for (const edge of graph.edges) {
      if (
        !edge.data ||
        typeof edge.data !== "object" ||
        !isEdgeData(edge.data)
      ) {
        return "Each edge must have a data object with source and target strings.";
      }
      // Add additional edge-specific validations here
    }

    return null; // No errors found
  };

  const handleNetworkGraphFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setIsLoading(true);

    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];

      try {
        const text = await file.text();
        const json = JSON.parse(text);

        const validationError = validateNetworkGraph(json);
        if (validationError) {
          setErrorMessage(validationError);
        } else {
          await saveToIndexedDB(json);
          router.push("/contextualization/graph");
        }
      } catch (error) {
        console.error("Error reading network graph file:", error);
        setErrorMessage("Error reading file");
      }
    } else {
      setErrorMessage("No file selected");
    }

    setIsLoading(false);
  };

  // Boolean state for mode - true for 'newCalculation', false for 'loadGraph'
  const [isNewCalculation, setIsNewCalculation] = useState(true);

  const handleToggleChange = () => {
    setIsNewCalculation(!isNewCalculation);
    // Additional logic for mode change
  };

  const primaryColor = "#bd93f9";
  const secondaryColor = "#ffb86c";

  return (
    <div className="container mx-auto px-4 prose">
      <h1>Contextualization of Non-Targeted Metabolites</h1>
      <p>
        Welcome to the Contextualization of Non-Targeted Metabolites. You can
        find the format specifications and parameter documentation{" "}
        <a href="/docs#contextualization" target="_blank" className="">
          here
        </a>{" "}
        and also{" "}
        <a href="/docs#impact-demo" target="_blank" className="">
          demo data
        </a>
        !
      </p>

      <div>
        <div className="mb-4">
          <div className="flex items-center justify-center mb-4">
            <span
              className="font-semibold"
              style={{
                color: isNewCalculation ? primaryColor : "",
              }}
            >
              New Calculation
            </span>

            <input
              type="checkbox"
              className={`toggle ml-2 mr-2 ${
                !isNewCalculation
                  ? "[--tglbg:#F2F2F2] hover:bg-secondary-100"
                  : "[--tglbg:#F2F2F2] hover:bg-primary-100"
              }`}
              style={{
                marginLeft: "0.5rem",
                marginRight: "0.5rem",
                backgroundColor: isNewCalculation ? "#bd93f9" : "#ffb86c",
                borderColor: isNewCalculation ? "#bd93f9" : "#ffb86c",
                // Add other styles as needed
              }}
              checked={!isNewCalculation}
              onChange={handleToggleChange}
            />

            <span
              className="font-semibold"
              style={{
                color: !isNewCalculation ? secondaryColor : "",
              }}
            >
              Load Existing Graph
            </span>
          </div>
        </div>

        {isNewCalculation && (
          <div>
            <div>
              <div className="grid grid-cols-2 gap-4 mb-2">
                <div>
                  <h3 className="text-lg font-semibold mb-2">MID File:</h3>
                  <input
                    type="file"
                    name="midFile"
                    accept=".csv"
                    onChange={handleMidFileChange}
                    className="file-input file-input-bordered file-input-sm w-full max-w-xs"
                  />
                  <p className="text-sm italic">
                    <span className="font-bold">Note:</span> Please ensure that
                    your CSV file complies with the specified format for a
                    smooth and error-free experience.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">
                    Pathway File (optional):
                  </h3>
                  <input
                    type="file"
                    name="pathwayFile"
                    accept=".json"
                    onChange={handlePathwayFileChange}
                    className="file-input file-input-bordered file-input-sm w-full max-w-xs"
                  />
                </div>
              </div>
              <h3 className="text-lg font-semibold mt-6">
                Contextualization Parameters:
              </h3>
              <div className="grid grid-cols-5 gap-4 mb-4">
                <div className="form-control w-full max-w-xs">
                  <label className="label">
                    <span className="label-text">Sum Threshold</span>
                    <span
                      className="tooltip"
                      data-tip="The maximum deviation from 1.0 of the sum of mass isotopomers during label detection."
                    >
                      <FaInfoCircle />
                    </span>
                  </label>
                  <input
                    type="number"
                    name="sumThreshold"
                    placeholder="sumThreshold"
                    value={sumThreshold}
                    className="input input-bordered input-sm w-full max-w-xs"
                    onChange={(e) =>
                      setSumThreshold(parseFloat(e.target.value))
                    }
                  />
                </div>
                <div className="form-control w-full max-w-xs">
                  <label className="label">
                    <span className="label-text">Min Labeling</span>
                    <span
                      className="tooltip"
                      data-tip="Percent minimum labeling for label detection."
                    >
                      <FaInfoCircle />
                    </span>
                  </label>
                  <input
                    type="number"
                    name="minLabel"
                    placeholder="minLabel"
                    value={minLabel}
                    className="input input-bordered input-sm w-full max-w-xs"
                    onChange={(e) => setMinLabel(parseFloat(e.target.value))}
                  />
                </div>
                <div className="form-control w-full max-w-xs">
                  <label className="label">
                    <span className="label-text">
                      Minimum Number of Carbons
                    </span>
                    <span
                      className="tooltip"
                      data-tip="The minimum number of carbon to use for contextualization."
                    >
                      <FaInfoCircle />
                    </span>
                  </label>
                  <input
                    type="number"
                    name="minCarbon"
                    placeholder="minCarbon"
                    value={minCarbon}
                    className="input input-bordered input-sm w-full max-w-xs"
                    onChange={(e) => setMinCarbon(parseInt(e.target.value))}
                  />
                </div>
                <div className="form-control w-full max-w-xs">
                  <label className="label">
                    <span className="label-text">Minimum Quantity</span>
                    <span
                      className="tooltip"
                      data-tip="Quantity threshold required for contextualization based on the chosen quantity column."
                    >
                      <FaInfoCircle />
                    </span>
                  </label>
                  <input
                    type="number"
                    name="minQuant"
                    placeholder="minQuant"
                    value={minQuant}
                    className="input input-bordered input-sm w-full max-w-xs"
                    onChange={(e) => setMinQuant(parseFloat(e.target.value))}
                  />
                </div>
                <div className="form-control w-full max-w-xs">
                  <label className="label">
                    <span className="label-text">M0 Threshold</span>
                    <span
                      className="tooltip"
                      data-tip="Minimum M0 value, below which the given metabolite is not used for contextualization."
                    >
                      <FaInfoCircle />
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.9"
                    name="m0Threshold"
                    placeholder="m0Threshold"
                    value={m0Threshold}
                    className="input input-bordered input-sm w-full max-w-xs"
                    onChange={(e) => setM0Threshold(parseFloat(e.target.value))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="form-group">
                  <label className="form-label">
                    Excluded Conditions
                    <span
                      className="tooltip ml-1"
                      data-tip="Conditions to exclude from contextualization."
                    >
                      <FaInfoCircle />
                    </span>
                  </label>
                  <Select
                    isMulti
                    name="excludedConditions"
                    options={conditionOptions}
                    className="basic-multi-select"
                    classNamePrefix="select"
                    placeholder="Select conditions to exclude..."
                    value={conditionOptions.filter((option) =>
                      excludedConditions.includes(option.value)
                    )}
                    onChange={(selectedOptions) => {
                      setExcludedConditions(
                        selectedOptions.map((option) => option.value)
                      );
                    }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Unlabeled Conditions{" "}
                    <span
                      className="tooltip ml-1"
                      data-tip="Unlabeled conditions to use for M0 threshold filtering."
                    >
                      <FaInfoCircle />
                    </span>
                  </label>
                  <Select
                    isMulti
                    name="unlabeledConditions"
                    options={conditionOptions}
                    className="basic-multi-select"
                    classNamePrefix="select"
                    placeholder="Select unlabeled conditions..."
                    value={conditionOptions.filter((option) =>
                      unlabeledConditions.includes(option.value)
                    )}
                    onChange={(selectedOptions) => {
                      setUnlabeledConditions(
                        selectedOptions.map((option) => option.value)
                      );
                    }}
                  />
                </div>
              </div>
              <div className="form-group flex items-center mt-4">
                <input
                  type="checkbox"
                  id="terms"
                  checked={agreedToTerms}
                  onChange={() => setAgreedToTerms(!agreedToTerms)}
                  className="checkbox"
                />
                <label htmlFor="terms" className="ml-2 text-sm">
                  This tool is freely available for academic, research, and
                  non-commercial purposes. Commercial entities, including
                  for-profit organizations, are prohibited from using the Target
                  Analysis, MID Calculation, and Contextualization tools.
                </label>
              </div>
              {errorMessage && <div className="text-error">{errorMessage}</div>}
              <button
                className="btn btn-success mt-4"
                onClick={handleSubmit}
                disabled={!agreedToTerms}
              >
                Submit
              </button>{" "}
              {isLoading && (
                <span className="center loading loading-spinner loading-md"></span>
              )}
            </div>
          </div>
        )}

        {!isNewCalculation && (
          <div>
            <div>
              <div className="grid grid-cols-2 gap-4 mb-2">
                <div>
                  <h3 className="text-lg font-semibold mb-2">
                    NetworkGraph File:
                  </h3>
                  <input
                    type="file"
                    name="networkGraphFile"
                    accept=".json"
                    onChange={handleNetworkGraphFileChange}
                    className="file-input file-input-bordered file-input-sm w-full max-w-xs"
                  />
                  {isLoading && (
                    <span className="center loading loading-spinner loading-md"></span>
                  )}
                </div>
              </div>
              {errorMessage && <div className="text-error">{errorMessage}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UntargetedContextualizaton;
