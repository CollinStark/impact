"use client";
import React, { useState, useEffect, useRef } from "react";
import api from "@/app/baseApi";
import getWebSocketBaseURL from "@/app/baseWebSocket";
import { saveToIndexedDB } from "@/app/indexedDB";
import { useRouter } from "next/navigation";

import FileDownload from "js-file-download";

const Page = ({ params }: { params: { id: string } }) => {
  const webSocketRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [isSessionActive, setIsSessionActive] = useState<boolean | null>(null);
  const [copySuccess, setCopySuccess] = useState("");
  const lastMessageRef = useRef<HTMLDivElement | null>(null);
  const [processingFinished, setProcessingFinished] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionData, setSessionData] = useState({
    session_id: null,
    preprocessing: "",
    calculation: "",
    context: "",
  });

  const router = useRouter();
  const [graphData, setGraphData] = useState(null);

  useEffect(() => {
    const checkSessionActive = async () => {
      try {
        const response = await api.get(
          `api/untargeted/session/${params.id}/is_active`
        );
        setIsSessionActive(response.data.active);
      } catch (error) {
        setIsSessionActive(false);
      }
    };

    checkSessionActive();
  }, [params.id]);

  useEffect(() => {
    if (isSessionActive) {
      const connectWebSocket = () => {
        const ws = new WebSocket(
          `${getWebSocketBaseURL()}/api/untargeted/ws/${params.id}`
        );

        ws.onopen = () => {};

        ws.onmessage = (event) => {
          const messageData = event.data;

          try {
            const jsonData = JSON.parse(messageData);
            setSessionData(jsonData);
          } catch (error) {
            setMessages((prevMessages) => [...prevMessages, messageData]);
          }
        };

        ws.onerror = (error) => {};

        ws.onclose = () => {};

        webSocketRef.current = ws;
      };

      connectWebSocket();

      return () => {
        if (webSocketRef.current) {
          webSocketRef.current.close();
        }
      };
    }
  }, [params.id, isSessionActive]);

  useEffect(() => {
    if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleViewGraph = async () => {
    setLoading(true);
    if (!graphData) {
      try {
        const response = await api.get(
          `api/untargeted/contextualization/download/${params.id}`
        );
        setGraphData(response.data);
        await saveToIndexedDB(response.data);
      } catch (error) {
        console.error("Error fetching processed data:", error);
      }
    }
    if (router) {
      router.push("/contextualization/graph");
    }
    setLoading(false);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopySuccess("URL copied to clipboard!");
    } catch (err) {
      setCopySuccess("Failed to copy URL.");
    }
  };

  const downloadFile = async (step: string, fileName: string) => {
    try {
      const response = await api.get(
        `api/untargeted/download/${params.id}/${step}/${fileName}`,
        {
          responseType: "blob",
        }
      );
      FileDownload(response.data, fileName);
    } catch (error) {
      console.error("Error downloading file:", error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "":
        return "bg-gray-500";
      case "waiting":
        return "bg-warning";
      case "done":
        return "bg-success";
      case "error":
        return "bg-error";
      default:
        return "bg-gray-500";
    }
  };

  const continueToCalculation = () => {
    router.push(`/mid-calculation?session_id=${params.id}`);
  };

  const continueToContext = () => {
    router.push(`/contextualization?session_id=${params.id}`);
  };

  let messageComponent;
  if (isSessionActive === null) {
    messageComponent = <p>Checking job status...</p>;
  } else if (!isSessionActive) {
    messageComponent = <p>This is not a valid job.</p>;
  } else if (isSessionActive) {
    messageComponent = (
      <div className="space-y-2">
        {messages.map((message, index) => (
          <div
            key={index}
            className="p-3 bg-gray-100 rounded-lg text-gray-700"
            ref={index === messages.length - 1 ? lastMessageRef : null}
          >
            {message}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 prose">
      <h1 className="mb-6">Job Status Page</h1>
      <p className="mb-4">
        Welcome to the Job Status Page. Here you can view the progress of all
        your jobs. If the processing takes longer than expected, you can copy
        the URL below to come back and check the status later.
      </p>
      <button
        onClick={handleCopyUrl}
        className="px-4 py-2 bg-info text-white rounded hover:bg-blue-400 mb-2"
      >
        Copy URL
      </button>
      {copySuccess && <p className="text-success">{copySuccess}</p>}

      <div className="rounded-lg shadow bg-white p-4 max-w-5xl mb-20">
        <div className="w-full h-12 rounded-lg overflow-hidden">
          <div className="flex w-full h-full">
            <div
              className={`flex-1 p-4 ${getStatusColor(
                sessionData.preprocessing
              )} rounded-l-lg`}
            >
              Preprocessing: {sessionData.preprocessing || "not started"}
            </div>
            <div
              className={`flex-1 p-4 ${getStatusColor(
                sessionData.calculation
              )}`}
            >
              Calculation: {sessionData.calculation || "not started"}
            </div>
            <div
              className={`flex-1 p-4 ${getStatusColor(
                sessionData.context
              )} rounded-r-lg`}
            >
              Context: {sessionData.context || "not started"}
            </div>
          </div>
        </div>

        <div className="h-96 overflow-y-auto p-1">{messageComponent}</div>

        <div className="continue">
          {sessionData.preprocessing === "done" &&
            sessionData.calculation !== "done" && (
              <button
                onClick={continueToCalculation}
                className="bg-primary hover:bg-primary-focus text-white font-bold py-2 px-4 rounded mt-4 mr-4"
              >
                Continue to Calculation
              </button>
            )}

          {sessionData.preprocessing === "done" &&
            sessionData.calculation === "done" && (
              <button
                onClick={continueToCalculation}
                className="bg-primary hover:bg-primary-focus text-white font-bold py-2 px-4 rounded mt-4 mr-4"
              >
                Redo Calculation
              </button>
            )}
          {sessionData.calculation === "done" &&
            sessionData.context !== "done" && (
              <>
                <button
                  onClick={continueToContext}
                  className="bg-primary hover:bg-primary-focus text-white font-bold py-2 px-4 rounded mt-4 mr-4"
                >
                  Continue to Contextualization
                </button>
                <p className="text-sm italic">
                  Please download the MIDs file and reupload it if you want to
                  do Contextualization!
                </p>
              </>
            )}
          {sessionData.calculation === "done" &&
            sessionData.context === "done" && (
              <>
                <button
                  onClick={continueToContext}
                  className="bg-primary hover:bg-primary-focus text-white font-bold py-2 px-4 rounded mt-4 mr-4"
                >
                  Redo Contextualization
                </button>
                <p className="text-sm italic">
                  Please download the MIDs file and reupload it if you want to
                  do Contextualization!
                </p>
              </>
            )}
          {sessionData.context === "done" && (
            <div className="">
              <button
                onClick={handleViewGraph}
                className="bg-success hover:bg-success-focus text-white font-bold py-2 px-4 rounded mt-4"
              >
                View Graph
              </button>
              {loading && (
                <div className="center loading loading-spinner loading-md"></div>
              )}
            </div>
          )}
        </div>
        <div className="downloads">
          <h2 className="text-xl mb-1">Downloads</h2>
          {sessionData.preprocessing === "done" && (
            <button
              onClick={() => downloadFile("results", "feature_intensities.csv")}
              className="bg-success hover:bg-success-focus text-white font-bold py-2 px-4 rounded mt-4 mr-4"
            >
              Download Feature Intensities
            </button>
          )}
          {sessionData.preprocessing === "done" && (
            <button
              onClick={() => downloadFile("results", "feature_annotation.csv")}
              className="bg-success hover:bg-success-focus text-white font-bold py-2 px-4 rounded mt-4 mr-4"
            >
              Download Feature Annotation
            </button>
          )}
          {sessionData.calculation === "done" && (
            <button
              onClick={() => downloadFile("mids", "isotopes.csv")}
              className="bg-success hover:bg-success-focus text-white font-bold py-2 px-4 rounded mt-4 mr-4"
            >
              Download Isotopes
            </button>
          )}
          {sessionData.calculation === "done" && (
            <button
              onClick={() => downloadFile("mids", "mid.csv")}
              className="bg-success hover:bg-success-focus text-white font-bold py-2 px-4 rounded mt-4 mr-4"
            >
              Download MIDs
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Page;
