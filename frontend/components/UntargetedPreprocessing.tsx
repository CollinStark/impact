"use client";
import React, { useState } from "react";
import api from "@/app/baseApi";
import { useRouter } from "next/navigation";
import StyledDropzone from "@/components/StyledDropzone";

const UntargetedPreprocessing = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [metaGroups, setMetaGroups] = useState<{ [fileName: string]: string }>(
    {}
  );
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formatFileSize = (size: number): string => {
    const KB = 1024;
    const MB = KB * 1024;
    if (size >= MB) return `${(size / MB).toFixed(1)} MB`;
    if (size >= KB) return `${(size / KB).toFixed(1)} KB`;
    return `${size} bytes`;
  };

  const handleFileChange = (acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      if (file.name.endsWith(".json")) {
        // Read meta file and update metaGroups state
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const content = JSON.parse(e.target?.result as string);
            setMetaGroups(content);
          } catch (error) {
            console.error("Error reading meta file:", error);
            setErrorMessage(
              "Invalid meta file format. Please upload a valid JSON file."
            );
          }
        };
        reader.readAsText(file);
      } else {
        setFiles((prevFiles) => [...prevFiles, file]);
      }
    });
  };

  const handleFileRemove = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleFileRemoveAll = () => {
    setFiles([]);
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setUploadProgress(0); // Reset progress bar before each upload

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    formData.append("meta", JSON.stringify(metaGroups));

    try {
      const response = await api.post(
        "api/untargeted/preprocessing",
        formData,
        {
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress(percentCompleted);
          },
        }
      );
      if (response.data.session_id) {
        router.push(`/preprocessing/params/${response.data.session_id}`);
      }
    } catch (error: any) {
      console.error("Error uploading files:", error);

      // Try to extract error message from API response
      let errorMessage = "Failed to upload files. Please try again.";
      if (error.response && error.response.data) {
        errorMessage = error.response.data.error || errorMessage;
      }

      setErrorMessage(errorMessage);
    }

    setIsLoading(false);
  };

  return (
    <div className="container mx-auto px-4 prose">
      <h1>LC-MS Data Preprocessing</h1>
      <p>
        Welcome to the LC-MS Data Preprocessing page, you can find the format
        specifications and documentation{" "}
        <a href="/docs#lc-ms-preprocessing" target="_blank" className="">
          here
        </a>{" "}
        and also{" "}
        <a href="/docs#impact-demo" target="_blank" className="">
          demo data
        </a>
        !
      </p>

      <StyledDropzone onDrop={handleFileChange} />
      {files.length > 0 && (
        <div className="">
          <div className="flex justify-between  mt-4">
            <button
              onClick={handleFileRemoveAll}
              className="bg-error text-base-100 p-2 rounded"
            >
              Remove All
            </button>
            <div className="submit">
              {isLoading && (
                <span className=" center loading loading-spinner loading-md mr-1"></span>
              )}
              <button
                onClick={handleSubmit}
                className="bg-success text-base-100 p-2 rounded"
              >
                Submit
              </button>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 my-4">
            <div
              className="bg-blue-500 h-4 rounded-full"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          {errorMessage && (
            <div className="bg-red-500 text-white p-2 rounded my-2">
              {errorMessage}
            </div>
          )}
          <div className="my-4 bg-base-100 shadow-lg rounded-lg shadow-base-300">
            <table className="table w-full border-2 border-base-300 ">
              <thead className="bg-base-100 text-neutral-content">
                <tr>
                  <th className="border-b-2 border-base-300">File Name</th>
                  <th className="border-b-2 border-base-300">Size</th>
                  <th className="border-b-2 border-base-300">Group</th>
                  <th className="border-b-2 border-base-300"></th>
                </tr>
              </thead>
              <tbody className="bg-base-100">
                {files.map((file, index) => (
                  <tr key={index} className="hover:bg-base-100">
                    <td className="border-b border-base-300">{file.name}</td>
                    <td className="border-b border-base-300">
                      {formatFileSize(file.size)}
                    </td>
                    <td className="border-b border-base-300">
                      {metaGroups[file.name] || "unknown"}
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
    </div>
  );
};

export default UntargetedPreprocessing;
