import React, { FormEvent, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import Select from "react-select";
import api from "@/app/baseApi";
import { FaInfoCircle } from "react-icons/fa";
import Papa from "papaparse";
interface CsvRow {
  condition: string;
}
const CalculationUpload = ({ sessionId }: { sessionId?: string }) => {
  const [agreedToTerms, setAgreedToTerms] = useState<boolean>(false);
  const [selectedFiles, setSelectedFiles] = useState({
    intFile: null as File | null,
    peakFile: null as File | null,
    groupFile: null as File | null,
  });
  const [files, setFiles] = useState([]);

  const [rtWindow, setRtWindow] = useState(4);
  const [ppm, setPpm] = useState(30);
  const [noiseCutoff, setNoiseCutoff] = useState(20);
  const [alpha, setAlpha] = useState(0.05);
  const [enrichTol, setEnrichTol] = useState(0.1);

  const [sumThreshold, setSumThreshold] = useState(0.2);
  const [minFraction, setMinFraction] = useState(0.75);
  const [minLabel, setMinLabel] = useState(0.05);
  const [maxLabel, setMaxLabel] = useState(0.1);
  const [formulaTrail, setFormulaTrail] = useState(true);

  const [ctrlCondition, setCtrlCondition] = useState<string>("");
  const [conditions, setConditions] = useState([]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();

  const handleGroupFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const target = event.target as HTMLInputElement;
    if (!target.files) return;

    const file = target.files[0];
    if (file) {
      if (file.name.endsWith(".csv")) {
        setSelectedFiles({ ...selectedFiles, [target.name]: target.files[0] });
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

  const handleFileChange = (e: FormEvent) => {
    const target = e.target as HTMLInputElement;
    if (!target.files) return;

    setSelectedFiles({ ...selectedFiles, [target.name]: target.files[0] });
  };

  const validateFile = (): boolean => {
    const maxFileSize = 25 * 1024 * 1024; // 25 MB in bytes

    let requiredFiles: ("intFile" | "peakFile" | "groupFile")[] = ["groupFile"];

    if (!sessionId) {
      requiredFiles = ["intFile", "peakFile", "groupFile"];
    }

    // Check if all required files are present
    for (const fileKey of requiredFiles) {
      if (!selectedFiles[fileKey]) {
        setErrorMessage(`Missing file: ${fileKey}`);
        return false;
      }
    }

    // Check file type and size
    for (const [key, file] of Object.entries(selectedFiles)) {
      if (file) {
        if (!file.name.endsWith(".csv")) {
          setErrorMessage(
            `Invalid file type for ${key}. Only CSV files are allowed.`
          );
          return false;
        }
        if (file.size > maxFileSize) {
          setErrorMessage(
            `File ${key} is too large. Maximum allowed size is 25 MB.`
          );
          return false;
        }
      }
    }

    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    setErrorMessage(null);
    if (!validateFile()) {
      return;
    }

    const formData = new FormData();
    Object.keys(selectedFiles).forEach((key) => {
      const fileKey = key as keyof typeof selectedFiles;
      const file = selectedFiles[fileKey];

      // Explicitly check for a non-null File object before appending
      if (file instanceof File) {
        formData.append(fileKey, file);
      }
    });
    formData.append("rtWindow", rtWindow.toString());
    formData.append("ppm", ppm.toString());
    formData.append("noiseCutoff", noiseCutoff.toString());
    formData.append("alpha", alpha.toString());
    formData.append("enrichTol", enrichTol.toString());

    formData.append("minLabel", minLabel.toString());
    formData.append("maxLabel", maxLabel.toString());
    formData.append("sumThreshold", sumThreshold.toString());
    formData.append("minFraction", minFraction.toString());
    formData.append("formulaTrail", formulaTrail.toString());

    if (ctrlCondition) {
      formData.append("ctrlCondition", ctrlCondition.toString());
    } else {
      setErrorMessage(
        "Please select a control condition to proceed with the calculation."
      );
      return;
    }

    if (sessionId) {
      formData.append("sessionId", sessionId.toString());
    } else {
      formData.append("sessionId", "");
    }

    setIsLoading(true);
    api
      .post("api/untargeted/calculation-upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      })
      .then((response) => {
        setIsLoading(false);
        router.push(`/share/${response.data.session_id}`);
      })
      .catch((error) => {
        console.log(isLoading);
        setIsLoading(false);
        console.error(error);
        setErrorMessage(error.response.data.detail);
      });
  };

  const removeSessionId = () => {
    router.push("/mid-calculation");
  };

  return (
    <div>
      {sessionId && (
        <div>
          <p className="text-info mb-4">
            Files for this session are already on the server. If you want to
            upload new data,{" "}
            <button
              onClick={removeSessionId}
              className="text-blue-500 underline"
            >
              {" "}
              click here{" "}
            </button>{" "}
            to remove the session ID.
          </p>
        </div>
      )}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">
              Feature Intensities File:
            </h3>
            <input
              type="file"
              name="intFile"
              onChange={handleFileChange}
              disabled={!!sessionId}
              className="file-input file-input-bordered file-input-sm w-full max-w-xs"
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">
              Feature Annotation File:
            </h3>
            <input
              type="file"
              name="peakFile"
              onChange={handleFileChange}
              disabled={!!sessionId}
              className="file-input file-input-bordered file-input-sm w-full max-w-xs"
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Group File:</h3>
            <input
              type="file"
              name="groupFile"
              onChange={handleGroupFileChange}
              className="file-input file-input-bordered file-input-sm w-full max-w-xs"
            />
          </div>
        </div>
        <h3 className="text-lg font-semibold mt-6">
          Isotope Detection Parameters:
        </h3>
        <div className="grid grid-cols-5 gap-4">
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">RT Window</span>
              <span
                className="tooltip"
                data-tip="Retention time window in which all peaks are considered to be co-eluting, in seconds."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              type="number"
              name="rtWindow"
              placeholder="rtWindow"
              value={rtWindow}
              className="input input-bordered input-sm w-full max-w-xs"
              onChange={(e) => setRtWindow(parseInt(e.target.value))}
            />
          </div>
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">ppm</span>
              <span
                className="tooltip"
                data-tip="ppm allowance for deviation of peaks within an isotopologue group from expected m/z; in practice this should be set higher than ppm tol used for peak-picking (e.g. 20 for a 5 ppm instrument) to ensure that all isotopologues are captured."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              type="number"
              name="ppm"
              placeholder="ppm"
              value={ppm}
              className="input input-bordered input-sm w-full max-w-xs"
              onChange={(e) => setPpm(parseInt(e.target.value))}
            />
          </div>
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">Noise Cutoff</span>
              <span
                className="tooltip"
                data-tip="Ion intensity cutoff below which a peak is considered noise."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              type="number"
              name="noiseCutoff"
              placeholder="noiseCutoff"
              value={noiseCutoff}
              className="input input-bordered input-sm w-full max-w-xs"
              onChange={(e) => setNoiseCutoff(parseInt(e.target.value))}
            />
          </div>
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">alpha</span>
              <span
                className="tooltip"
                data-tip="p-value cutoff for calling significance of label enrichment."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              type="number"
              step="0.01"
              name="alpha"
              placeholder="alpha"
              value={alpha}
              className="input input-bordered input-sm w-full max-w-xs"
              onChange={(e) => setAlpha(parseFloat(e.target.value))}
            />
          </div>
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">Enrichment Tolerance</span>
              <span
                className="tooltip"
                data-tip="Tolerance parameter for enforcing enrichment of higher isotopologues in labeled samples; a value of 0 enforces strict requirement for enrichment of higher isotopologues to be higher in labeled samples."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              type="number"
              step="0.01"
              name="enrichTol"
              placeholder="enrichTol"
              value={enrichTol}
              className="input input-bordered input-sm w-full max-w-xs"
              onChange={(e) => setEnrichTol(parseFloat(e.target.value))}
            />
          </div>
        </div>
        <h3 className="text-lg font-semibold mt-6">
          Mass Isotopomer Distribution Parameters:
        </h3>
        <div className="grid grid-cols-3 gap-4">
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
              onChange={(e) => setSumThreshold(parseFloat(e.target.value))}
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
                Required Fraction of Replicates
              </span>
              <span
                className="tooltip"
                data-tip="Fractions of replicates needed for label detection. `1.0` detects only metabolites which are found in all replicates, with `0.5` a metabolite needs to be found in at least 50% of the replicates."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              type="number"
              step="0.01"
              name="minFraction"
              placeholder="minFraction"
              value={minFraction}
              className="input input-bordered input-sm w-full max-w-xs"
              onChange={(e) => setMinFraction(parseFloat(e.target.value))}
            />
          </div>

          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">Max Labeling</span>
              <span
                className="tooltip"
                data-tip="Percent maximum labeling in unlabeled samples."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              type="number"
              name="maxLabel"
              placeholder="maxLabel"
              value={maxLabel}
              className="input input-bordered input-sm w-full max-w-xs"
              onChange={(e) => setMaxLabel(parseFloat(e.target.value))}
            />
          </div>

          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">Formula based MIDs</span>
              <span
                className="tooltip"
                data-tip="Trailing mass isotpomers are cut based on the given Formula."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              className="checkbox mr-2"
              type="checkbox"
              checked={formulaTrail}
              onChange={(e) => setFormulaTrail(!formulaTrail)}
            />
          </div>
        </div>
        <div className="form-group mt-4">
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
            non-commercial purposes. Commercial entities, including for-profit
            organizations, are prohibited from using the Target Analysis, MID
            Calculation, and Contextualization tools.
          </label>
        </div>
        {errorMessage && <div className="text-error">{errorMessage}</div>}
        <button
          type="submit"
          className="btn btn-success mt-4"
          disabled={!agreedToTerms}
        >
          Upload
        </button>{" "}
        {isLoading && (
          <span className="center loading loading-spinner loading-md"></span>
        )}
      </form>
    </div>
  );
};

export default CalculationUpload;
