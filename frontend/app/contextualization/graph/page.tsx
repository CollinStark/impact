"use client";

import React, { useState, useEffect } from "react";
import ContextGraph from "@/components/ContextGraph";
import {
  loadFromIndexedDB,
  saveToIndexedDB,
  deleteFromIndexedDB,
} from "@/app/indexedDB";

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

const ContextGraphPage = () => {
  const [networkData, setNetworkData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

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
          saveToIndexedDB(json);
          setNetworkData(json);
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

  const handleDeleteData = async () => {
    await deleteFromIndexedDB();
    setNetworkData(null);
  };

  useEffect(() => {
    const fetchData = async () => {
      const data = await loadFromIndexedDB();
      if (data) {
        setNetworkData(data);
      }
      setIsLoading(false);
    };

    fetchData();
  }, []);

  return (
    <div className="container mx-auto p-4 prose">
      <h1 className="mb-6">Contextualization Graph</h1>
      <p className="mb-4">
        Welcome to the Contextualization Graph. You can find the tool
        documentation{" "}
        <a href="/docs#network-graph" target="_blank" className="">
          here
        </a>
        !
      </p>
      {isLoading ? (
        <div className="center loading loading-spinner loading-lg"></div>
      ) : networkData ? (
        <div>
          <div style={{ textAlign: "right" }}>
            <button onClick={handleDeleteData} className="btn btn-error mb-1">
              Delete Data
            </button>
          </div>

          <ContextGraph networkData={networkData} />
        </div>
      ) : (
        <div>
          <h3>Upload JSON File for Contextualization</h3>
          <input
            type="file"
            name="networkGraphFile"
            accept=".json"
            onChange={handleNetworkGraphFileChange}
            className="file-input file-input-bordered file-input-sm w-full max-w-xs"
          />
          {errorMessage && <p className="text-error">{errorMessage}</p>}
        </div>
      )}
    </div>
  );
};

export default ContextGraphPage;
