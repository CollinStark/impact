"use client";

import React, { useState, ChangeEvent } from "react";
import api from "@/app/baseApi";
import StyledDropzone from "@/components/StyledDropzone";
import { FaInfoCircle } from "react-icons/fa";
import { useRouter } from "next/navigation";

interface LibraryAnnotationParams {
  toleranceRt: number;
  ppm: number;
  file: File | null;
}

interface MS2AnnotationParams {
  toleranceRt: number;
  ppm: number;
  scoreThreshold: number;
  requirePrecursor: boolean;
  tolerance: number;
  files: File[];
}

const Params = ({ params }: { params: { id: string } }) => {
  const sessionId = params.id;
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");

  const [peakPickingParams, setPeakPickingParams] = useState({
    min_peakwidth: 2,
    max_peakwidth: 10,
    ppm: 20,
    integrate: 2,
    snthresh: 10,
    noise: 100,
    prefilter_count: 3,
    prefilter_intensity: 100,
  });

  const [peakGroupParams, setPeakGroupParams] = useState({
    bw: 1.8,
    minFraction: 0.75,
    binSize: 0.02,
  });

  const [peakAlignmentParams, setPeakAlignmentParams] = useState({
    minFraction: 0.75,
    span: 0.6,
  });

  const [ms1AnnotationParams, setMs1AnnotationParams] = useState({
    polarity: 0,
    adducts: [
      ["[M-H]-", "[M+Cl]-", "[M+C2H3O2]-"],
      ["[M+H]+", "[M+Na]+", "[M+K]+", "[M+NH4]+"],
    ],
    chosen: ["[M-H]-"],
    ppm: 20,
  });

  // State for the selected polarity and adducts
  const [polarity, setPolarity] = useState(ms1AnnotationParams.polarity);
  const [chosenAdducts, setChosenAdducts] = useState(
    ms1AnnotationParams.chosen
  );

  const [isLibraryEnabled, setIsLibraryEnabled] = useState(false);
  const [libraryAnnotationParams, setLibraryAnnotationParams] =
    useState<LibraryAnnotationParams>({
      toleranceRt: 10,
      ppm: 5,
      file: null,
    });

  const [isMs2Enabled, setIsMs2Enabled] = useState(false);
  const [ms2AnnotationParams, setMs2AnnotationParams] =
    useState<MS2AnnotationParams>({
      toleranceRt: 5,
      ppm: 50,
      scoreThreshold: 0.5,
      requirePrecursor: true,
      tolerance: 0.1,
      files: [],
    });
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const formatFileSize = (size: number): string => {
    const KB = 1024;
    const MB = KB * 1024;
    if (size >= MB) return `${(size / MB).toFixed(1)} MB`;
    if (size >= KB) return `${(size / KB).toFixed(1)} KB`;
    return `${size} bytes`;
  };
  const handleFileChange = (acceptedFiles: File[]) => {
    setMs2AnnotationParams((prevParams) => ({
      ...prevParams,
      files: [...prevParams.files, ...acceptedFiles],
    }));
  };

  const handleFileRemove = (index: number) => {
    setMs2AnnotationParams((prevParams) => ({
      ...prevParams,
      files: prevParams.files.filter((_, i) => i !== index),
    }));
  };

  const handleFileRemoveAll = () => {
    setMs2AnnotationParams((prevParams) => ({
      ...prevParams,
      files: [],
    }));
  };

  const handleLibraryChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files[0];
    if (file) {
      setLibraryAnnotationParams((prevParams) => ({
        ...prevParams,
        file: file,
      }));
    }
  };

  // Function to handle polarity change
  const handlePolarityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setPolarity(parseInt(event.target.value));
    setChosenAdducts([]); // Reset chosen adducts when polarity changes
  };

  // Function to handle adducts selection
  const handleAdductChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedAdduct = event.target.value;
    if (event.target.checked) {
      setChosenAdducts([...chosenAdducts, selectedAdduct]);
    } else {
      setChosenAdducts(
        chosenAdducts.filter((adduct) => adduct !== selectedAdduct)
      );
    }
  };

  //   Handle form submission
  const handleSubmit = async () => {
    setUploadProgress(0);
    setIsLoading(true);
    const formData = new FormData();

    // Append the library file to formData if it exists
    if (libraryAnnotationParams.file) {
      formData.append("libraryFile", libraryAnnotationParams.file);
    }

    // Append MS2 files to formData
    ms2AnnotationParams.files.forEach((file, index) => {
      if (file) formData.append(`ms2Files`, file);
    });

    // Append other parameters as JSON
    const otherParams = {
      sessionId,
      peakPickingParams,
      peakAlignmentParams,
      peakGroupParams,
      ms1AnnotationParams: {
        ...ms1AnnotationParams,
        adducts: undefined,
        chosen: chosenAdducts,
      },
      libraryAnnotationParams: {
        ...libraryAnnotationParams,
        file: undefined,
      },
      ms2AnnotationParams: { ...ms2AnnotationParams, files: undefined },
    };
    formData.append("jsonString", JSON.stringify(otherParams));

    api
      .post("api/untargeted/preprocessing/params", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          // Calculate percentage completed
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      })
      .then((res) => {
        router.push(`/share/${res.data.session_id}`);
        setIsLoading(false);
      })
      .catch((err) => {
        setErrorMessage(err.message);
        console.log(err);
        setIsLoading(false);
      });
  };

  // Render the form
  return (
    <div className="container mx-auto p-4 prose">
      <h1>LC-MS Data Preprocessing - Parameter Selection</h1>
      <div>
        <p>
          Your data was successfully uploaded, you can find all the
          documentation for the parameter selection{" "}
          <a href="/docs#parameter-selection" target="_blank" className="">
            here
          </a>
          !
        </p>
      </div>
      <div className="submit mb-4">
        <button
          onClick={handleSubmit}
          className="bg-success text-base-100 p-2 rounded"
        >
          Submit
        </button>
        {isLoading && (
          <span className=" center loading loading-spinner loading-md ml-1"></span>
        )}
      </div>
      <div className="w-full bg-gray-200 rounded-full h-4 my-4">
        <div
          className="bg-blue-500 h-4 rounded-full transition-all duration-300"
          style={{ width: `${uploadProgress}%` }}
        ></div>
      </div>
      {errorMessage && <div className="text-error">{errorMessage}</div>}

      <div className="collapse collapse-arrow bg-base-200 mb-4">
        <input type="checkbox" />
        <div className="collapse-title text-xl font-medium">Peak Picking</div>
        <div className="collapse-content">
          {/* Peak Picking */}
          <div className="mb-4">
            <div className="form-control w-full max-w-xs">
              <label className="label">
                <span className="label-text">min_peakwidth</span>
                <span
                  className="tooltip"
                  data-tip="Approximate min peak width in chromatographic space."
                >
                  <FaInfoCircle />
                </span>
              </label>
              <input
                className="input input-bordered input-sm w-full max-w-xs"
                type="number"
                step="0.01"
                value={peakPickingParams.min_peakwidth}
                onChange={(e) =>
                  setPeakPickingParams({
                    ...peakPickingParams,
                    min_peakwidth: parseFloat(e.target.value),
                  })
                }
              />
            </div>
            <div className="form-control w-full max-w-xs">
              <label className="label">
                <span className="label-text">max_peakwidth</span>
                <span
                  className="tooltip"
                  data-tip="Approximate max peak width in chromatographic space."
                >
                  <FaInfoCircle />
                </span>
              </label>
              <input
                className="input input-bordered input-sm w-full max-w-xs"
                type="number"
                step="0.01"
                value={peakPickingParams.max_peakwidth}
                onChange={(e) =>
                  setPeakPickingParams({
                    ...peakPickingParams,
                    max_peakwidth: parseFloat(e.target.value),
                  })
                }
              />
            </div>
            <div className="form-control w-full max-w-xs">
              <label className="label">
                <span className="label-text">ppm</span>
                <span
                  className="tooltip"
                  data-tip="Maximal tolerated m/z deviation in consecutive scans in parts per million (ppm) for the initial ROI definition."
                >
                  <FaInfoCircle />
                </span>
              </label>
              <input
                className="input input-bordered input-sm w-full max-w-xs"
                type="number"
                step="0.01"
                value={peakPickingParams.ppm}
                onChange={(e) =>
                  setPeakPickingParams({
                    ...peakPickingParams,
                    ppm: parseFloat(e.target.value),
                  })
                }
              />
            </div>
            <div className="form-control w-full max-w-xs">
              <label className="label">
                <span className="label-text">integrate</span>
                <span
                  className="tooltip"
                  data-tip="Integration method. For integrate = 1 peak limits are found through descent on the mexican hat filtered data, for integrate = 2 the descent is done on the real data. The latter method is more accurate but prone to noise, while the former is more robust, but less exact."
                >
                  <FaInfoCircle />
                </span>
              </label>
              <select
                className="select select-bordered select-sm w-full max-w-xs"
                value={peakPickingParams.integrate}
                onChange={(e) =>
                  setPeakPickingParams({
                    ...peakPickingParams,
                    integrate: parseInt(e.target.value),
                  })
                }
              >
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </div>

            <div className="form-control w-full max-w-xs">
              <label className="label">
                <span className="label-text">snthresh</span>
                <span
                  className="tooltip"
                  data-tip="Defining the signal to noise ratio cutoff."
                >
                  <FaInfoCircle />
                </span>
              </label>
              <input
                className="input input-bordered input-sm w-full max-w-xs"
                type="number"
                step="0.01"
                value={peakPickingParams.snthresh}
                onChange={(e) =>
                  setPeakPickingParams({
                    ...peakPickingParams,
                    snthresh: parseFloat(e.target.value),
                  })
                }
              />
            </div>
            <div className="form-control w-full max-w-xs">
              <label className="label">
                <span className="label-text">noise</span>
                <span
                  className="tooltip"
                  data-tip="Minimum intensity required for centroids to be considered in the first analysis step (centroids with intensity < noise are omitted from ROI detection)."
                >
                  <FaInfoCircle />
                </span>
              </label>
              <input
                className="input input-bordered input-sm w-full max-w-xs"
                type="number"
                step="0.01"
                value={peakPickingParams.noise}
                onChange={(e) =>
                  setPeakPickingParams({
                    ...peakPickingParams,
                    noise: parseFloat(e.target.value),
                  })
                }
              />
            </div>
            <div className="form-control w-full max-w-xs">
              <label className="label">
                <span className="label-text">prefilter_count</span>
                <span
                  className="tooltip"
                  data-tip="Specifying the prefilter step for the first analysis step (ROI detection). Mass traces are only retained if they contain at least prefilter_count peaks with intensity >= prefilter_intensity."
                >
                  <FaInfoCircle />
                </span>
              </label>
              <input
                className="input input-bordered input-sm w-full max-w-xs"
                type="number"
                value={peakPickingParams.prefilter_count}
                onChange={(e) =>
                  setPeakPickingParams({
                    ...peakPickingParams,
                    prefilter_count: parseFloat(e.target.value),
                  })
                }
              />
            </div>
            <div className="form-control w-full max-w-xs">
              <label className="label">
                <span className="label-text">prefilter_intensity</span>
                <span
                  className="tooltip"
                  data-tip="Specifying the prefilter step for the first analysis step (ROI detection). Mass traces are only retained if they contain at least prefilter_count peaks with intensity >= prefilter_intensity."
                >
                  <FaInfoCircle />
                </span>
              </label>
              <input
                className="input input-bordered input-sm w-full max-w-xs"
                type="number"
                step="0.01"
                value={peakPickingParams.prefilter_intensity}
                onChange={(e) =>
                  setPeakPickingParams({
                    ...peakPickingParams,
                    prefilter_intensity: parseFloat(e.target.value),
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div className="collapse collapse-arrow bg-base-200 mb-4">
        <input type="checkbox" />
        <div className="collapse-title text-xl font-medium">Peak Alignment</div>
        <div className="collapse-content">
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">minFraction</span>
              <span
                className="tooltip"
                data-tip="Between 0 and 1 defining the minimum required fraction of samples in which peaks for the peak group were identified."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              className="input input-bordered input-sm w-full max-w-xs"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={peakAlignmentParams.minFraction}
              onChange={(e) =>
                setPeakAlignmentParams({
                  ...peakAlignmentParams,
                  minFraction: parseFloat(e.target.value),
                })
              }
            />
          </div>
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">span</span>
              <span className="tooltip" data-tip="The degree of smoothing.">
                <FaInfoCircle />
              </span>
            </label>
            <input
              className="input input-bordered input-sm w-full max-w-xs"
              type="number"
              step="0.01"
              value={peakAlignmentParams.span}
              onChange={(e) =>
                setPeakAlignmentParams({
                  ...peakAlignmentParams,
                  span: parseFloat(e.target.value),
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="collapse collapse-arrow bg-base-200 mb-4">
        <input type="checkbox" />
        <div className="collapse-title text-xl font-medium">Peak Grouping</div>
        <div className="collapse-content">
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">bw</span>
              <span
                className="tooltip"
                data-tip="Bandwidth (standard deviation or half width at half maximum) of gaussian smoothing kernel to apply to the peak density chromatogram."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              className="input input-bordered input-sm w-full max-w-xs"
              type="number"
              step="0.01"
              value={peakGroupParams.bw}
              onChange={(e) =>
                setPeakGroupParams({
                  ...peakGroupParams,
                  bw: parseFloat(e.target.value),
                })
              }
            />
          </div>
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">minFraction</span>
              <span
                className="tooltip"
                data-tip="Minimum fraction of samples necessary in at least one of the sample groups for it to be a valid group."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              className="input input-bordered input-sm w-full max-w-xs"
              type="number"
              step="0.01"
              value={peakGroupParams.minFraction}
              onChange={(e) =>
                setPeakGroupParams({
                  ...peakGroupParams,
                  minFraction: parseFloat(e.target.value),
                })
              }
            />
          </div>
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">binSize</span>
              <span
                className="tooltip"
                data-tip="Defining the size of the overlapping slices in mz dimension."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              className="input input-bordered input-sm w-full max-w-xs"
              type="number"
              step="0.01"
              value={peakGroupParams.binSize}
              onChange={(e) =>
                setPeakGroupParams({
                  ...peakGroupParams,
                  binSize: parseFloat(e.target.value),
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="collapse collapse-arrow bg-base-200 mb-4">
        <input type="checkbox" />
        <div className="collapse-title text-xl font-medium">MS1 Annotation</div>
        <div className="collapse-content">
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">Polarity</span>
              <span
                className="tooltip"
                data-tip="Polarity mode of the measurement."
              >
                <FaInfoCircle />
              </span>
            </label>
            <select
              className="select select-bordered"
              value={polarity}
              onChange={handlePolarityChange}
            >
              <option value="0">Negative</option>
              <option value="1">Positive</option>
            </select>
          </div>

          <div className="form-control w-full max-w-xs mt-2">
            <label className="label">
              <span className="label-text">Adducts</span>
              <span
                className="tooltip"
                data-tip="Adducts to consider for annotation. Adducts depend on the selected polarity/mobile phase during the measurement."
              >
                <FaInfoCircle />
              </span>
            </label>
            {ms1AnnotationParams.adducts[polarity].map((adduct) => (
              <label className="label cursor-pointer" key={adduct}>
                <span className="label-text font-semibold">{adduct}</span>
                <input
                  className="checkbox"
                  type="checkbox"
                  value={adduct}
                  checked={chosenAdducts.includes(adduct)}
                  onChange={handleAdductChange}
                />
              </label>
            ))}
          </div>

          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">ppm</span>
              <span
                className="tooltip"
                data-tip="Define the maximal acceptable m/z relative difference between query and target m/z values."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              className="input input-bordered input-sm w-full max-w-xs"
              type="number"
              step="1"
              value={ms1AnnotationParams.ppm}
              onChange={(e) =>
                setMs1AnnotationParams({
                  ...ms1AnnotationParams,
                  ppm: parseInt(e.target.value),
                })
              }
            />
          </div>
        </div>
      </div>

      <label className="cursor-pointer flex items-center justify-items-start mb-2">
        <input
          className="checkbox mr-2"
          type="checkbox"
          checked={isLibraryEnabled}
          onChange={() => setIsLibraryEnabled(!isLibraryEnabled)}
        />
        <span className="label-text font-semibold">
          Enable Library Annotation
        </span>
      </label>
      <div
        className={`collapse collapse-arrow bg-base-200 mb-4 ${
          !isLibraryEnabled ? "opacity-50" : ""
        }`}
      >
        <input type="checkbox" disabled={!isLibraryEnabled} />
        <div className="collapse-title text-xl font-medium">
          Library Annotation Parameters
        </div>
        <div className="collapse-content">
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">Library File (csv-format):</span>
              <span
                className="tooltip"
                data-tip="Requires the columns name (name of the metabolite), id (unique identifier), exactmass (m/z value), and rt (retention time in seconds)."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              type="file"
              name="libraryFile"
              accept=".csv"
              disabled={!isLibraryEnabled}
              onChange={handleLibraryChange}
              className="file-input file-input-bordered file-input-sm w-full max-w-xs"
            />
          </div>
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">ppm</span>
              <span
                className="tooltip"
                data-tip="Define the maximal acceptable m/z relative difference between query and target m/z values."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              className="input input-bordered input-sm w-full max-w-xs"
              type="number"
              step="1"
              value={libraryAnnotationParams.ppm}
              disabled={!isLibraryEnabled}
              onChange={(e) =>
                setLibraryAnnotationParams({
                  ...libraryAnnotationParams,
                  ppm: parseInt(e.target.value),
                })
              }
            />
          </div>

          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">toleranceRt</span>
              <span
                className="tooltip"
                data-tip="Specify the maximal acceptable difference between query and target retention time values."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              className="input input-bordered input-sm w-full max-w-xs"
              type="number"
              step="1"
              value={libraryAnnotationParams.toleranceRt}
              disabled={!isLibraryEnabled}
              onChange={(e) =>
                setLibraryAnnotationParams({
                  ...libraryAnnotationParams,
                  toleranceRt: parseInt(e.target.value),
                })
              }
            />
          </div>
        </div>
      </div>
      <label className="cursor-pointer flex items-center justify-items-start mb-2">
        <input
          className="checkbox mr-2"
          type="checkbox"
          checked={isMs2Enabled}
          onChange={() => setIsMs2Enabled(!isMs2Enabled)}
        />
        <span className="label-text font-semibold">Enable MS2 Annotation</span>
      </label>
      <div
        className={`collapse collapse-arrow bg-base-200 mb-4 ${
          !isMs2Enabled ? "opacity-50" : ""
        }`}
      >
        <input type="checkbox" disabled={!isMs2Enabled} />
        <div className="collapse-title text-xl font-medium">
          MS2 Annotation Parameters
        </div>
        <div className="collapse-content">
          <StyledDropzone onDrop={handleFileChange} />
          {ms2AnnotationParams.files.length > 0 && (
            <div className="">
              <div className="flex justify-between  mt-4">
                <button
                  onClick={handleFileRemoveAll}
                  className="bg-error text-base-100 p-2 rounded"
                >
                  Remove All
                </button>
              </div>
              <div className="my-4 bg-base-100 shadow-lg rounded-lg shadow-base-300">
                <table className="table w-full border-2 border-base-300 ">
                  <thead className="bg-base-100 text-neutral-content">
                    <tr>
                      <th className="border-b-2 border-base-300">File Name</th>
                      <th className="border-b-2 border-base-300">Size</th>
                      <th className="border-b-2 border-base-300"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-base-100">
                    {ms2AnnotationParams.files.map((file, index) => (
                      <tr key={index} className="hover:bg-base-100">
                        <td className="border-b border-base-300">
                          {file.name}
                        </td>

                        <td className="border-b border-base-300">
                          {formatFileSize(file.size)}
                        </td>

                        <th className="border-b border-base-300">
                          <button
                            onClick={() => handleFileRemove(index)}
                            className="ml-2 text-error btn btn-ghost btn-xs"
                          >
                            Delete
                          </button>
                        </th>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">ppm</span>
              <span
                className="tooltip"
                data-tip="Define the maximal acceptable m/z relative difference between query and target m/z values."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              className="input input-bordered input-sm w-full max-w-xs"
              type="number"
              step="1"
              value={ms2AnnotationParams.ppm}
              disabled={!isMs2Enabled}
              onChange={(e) =>
                setMs2AnnotationParams({
                  ...ms2AnnotationParams,
                  ppm: parseInt(e.target.value),
                })
              }
            />
          </div>

          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">toleranceRt</span>
              <span
                className="tooltip"
                data-tip="Specify the maximal acceptable difference between query and target retention time values."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              className="input input-bordered input-sm w-full max-w-xs"
              type="number"
              step="1"
              value={ms2AnnotationParams.toleranceRt}
              disabled={!isMs2Enabled}
              onChange={(e) =>
                setMs2AnnotationParams({
                  ...ms2AnnotationParams,
                  toleranceRt: parseInt(e.target.value),
                })
              }
            />
          </div>
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">scoreThreshold</span>
              <span
                className="tooltip"
                data-tip="Score threshold for MS2 spectra matching for 0 to 1."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              className="input input-bordered input-sm w-full max-w-xs"
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={ms2AnnotationParams.scoreThreshold}
              disabled={!isMs2Enabled}
              onChange={(e) =>
                setMs2AnnotationParams({
                  ...ms2AnnotationParams,
                  scoreThreshold: parseInt(e.target.value),
                })
              }
            />
          </div>
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">tolerance</span>
              <span
                className="tooltip"
                data-tip="Maximal acceptable absolute difference in m/z to consider them matching."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              className="input input-bordered input-sm w-full max-w-xs"
              type="number"
              step="0.1"
              value={ms2AnnotationParams.tolerance}
              disabled={!isMs2Enabled}
              onChange={(e) =>
                setMs2AnnotationParams({
                  ...ms2AnnotationParams,
                  tolerance: parseInt(e.target.value),
                })
              }
            />
          </div>
          <div className="form-control w-full max-w-xs">
            <label className="label">
              <span className="label-text">requirePrecursor</span>
              <span
                className="tooltip"
                data-tip="Whether only target spectra are considered in the similarity calculation with a precursor m/z that matches the precursor m/z of the query spectrum (considering also ppm and tolerance)."
              >
                <FaInfoCircle />
              </span>
            </label>
            <input
              className="checkbox mr-2"
              type="checkbox"
              checked={ms2AnnotationParams.requirePrecursor}
              disabled={!isMs2Enabled}
              onChange={(e) =>
                setMs2AnnotationParams({
                  ...ms2AnnotationParams,
                  requirePrecursor: !ms2AnnotationParams.requirePrecursor,
                })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Params;
