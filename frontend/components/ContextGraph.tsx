"use client";

import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  ChangeEvent,
} from "react";
import {
  useTable,
  useSortBy,
  usePagination,
  CellProps,
  Column,
} from "react-table";

import cytoscape, { Core, Stylesheet } from "cytoscape";
import fcose from "cytoscape-fcose";

cytoscape.use(fcose);

import MidPlot from "./MidPlot";

import {
  BsArrowRightShort,
  BsBarChartLineFill,
  BsGearFill,
  BsFiletypePng,
  BsSearch,
  BsLayoutWtf,
} from "react-icons/bs";
import {
  FaFileDownload,
  FaSearch,
  FaInfoCircle,
  FaChevronUp,
  FaChevronDown,
} from "react-icons/fa";
import { FaCircleNodes } from "react-icons/fa6";
import { LuFileJson } from "react-icons/lu";
import { PiGraphFill } from "react-icons/pi";
import { SlGraph } from "react-icons/sl";
import { MdDataThresholding } from "react-icons/md";

import QuantPlot from "./QuantPlot";
import { themePalette, colorBlindPalette } from "./colorPalettes";
import ModeSwitcher from "./ContextModeSwitcher";
import { configTargeted, configUnknown } from "./CytoscapeConfiguration";

interface QuantProps {
  value: [number];
  err: [number];
  experiment: string;
}

interface FractionalContributionProps {
  value: [number];
  experiment: string;
}

interface MidProps {
  experiment: string;
  condition: string;
  values: [number];
  err: [number];
}

interface NodeData {
  name: string;
  id: string;
  node_id: number | null;
  mz: number | null;
  rt: number | null;

  quantification: QuantProps[];
  mids: MidProps[];
  pool_variability: number | null;
  fc_variability: number | null;
  type: string;

  fc: FractionalContributionProps[];
  fc_pool: FractionalContributionProps[];

  orgPos?: {
    x: number;
    y: number;
  };
}

interface NodeProps {
  data: NodeData;
  position: {
    x: number;
    y: number;
  };
  group: "nodes";
}

interface EdgeData {
  source: string;
  target: string;
  experiment: string;
  connections: { [key: string]: number };
  min_distance: number;
  max_distance: number;
  mean_distance: number;
  median_distance: number;
  scaledDistance: number;
  id: string;
}

interface EdgeProps {
  data: EdgeData;
  position: {
    x: number;
    y: number;
  };
  group: "edges";
}

interface NetworkData {
  nodes: NodeProps[];
  edges: EdgeProps[];
  experiments: any[];
  conditions: any[];
}

interface ContextGraphProps {
  networkData: NetworkData;
}

const ContextGraph: React.FC<ContextGraphProps> = ({ networkData }) => {
  const [distanceThreshold, setDistanceThreshold] = useState(1);
  const [hightlightMode, setHighlightMode] = useState(false);
  const [connectionThreshold, setConnectionThreshold] = useState(1);

  const [selectedNodeData, setSelectedNodeData] = useState<NodeData | null>(
    null
  );
  const [selectedNodeDataEdges, setSelectedNodeDataEdges] = useState<
    EdgeData[] | null
  >(null);
  const [selectedEdgeData, setSelectedEdgeData] = useState<EdgeData | null>(
    null
  );

  const experiments: string[] = networkData.experiments;
  const colors: string[] = colorBlindPalette[experiments.length];
  const experimentColorMap: Record<string, string> = useMemo(() => {
    const colorMap: Record<string, string> = {};
    experiments.forEach((exp: string, index: number) => {
      colorMap[exp] = colors[index];
    });
    return colorMap;
  }, [experiments, colors]);

  const [activeExperiments, setActiveExperiments] = useState(experiments);

  const handleExperimentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedExperiment = event.target.value;
    if (event.target.checked) {
      setActiveExperiments([...activeExperiments, selectedExperiment]);
    } else {
      setActiveExperiments(
        activeExperiments.filter(
          (experiment) => experiment !== selectedExperiment
        )
      );
    }
  };

  const handleSingleExperimentChange = (
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    const selectedExperiment = event.target.value;
    setActiveExperiments([selectedExperiment]);
  };

  const conditions = networkData.conditions;
  const condCombinations = conditions.length * conditions.length;

  const cyRef = useRef<HTMLDivElement | null>(null);
  const cy = useRef<Core | null>(null);
  const removedEdgesRef = useRef<EdgeProps[]>([]);
  const removedNodesRef = useRef<cytoscape.NodeSingular[]>([]);
  const previousDistanceThreshold = useRef<number>(distanceThreshold);
  const previousConnectionThreshold = useRef<number>(connectionThreshold);
  const previousActiveExperiments = useRef<string[]>(activeExperiments);
  const previousHighlightMode = useRef<boolean>(hightlightMode);

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const [mode, setMode] = useState("unknown");
  const previousMode = useRef<string>(mode);

  const [highlightInProgress, setHighlightInProgress] = useState(false);
  const lastHighlighted = useRef<cytoscape.CollectionReturnValue | null>(null);
  const lastUnhighlighted = useRef<cytoscape.CollectionReturnValue | null>(
    null
  );

  const [sizeThresholds, setSizeThresholds] = useState({
    xl: 0.001,
    large: 0.01,
    medium: 0.05,
    small: 0.1,
  });
  const [colorThresholds, setColorThresholds] = useState({
    ff5555: 0.001,
    ff8c69: 0.01,
    ffb78d: 0.05,
    ffdcc0: 0.1,
  });

  const [sizeThresholdsSingle, setSizeThresholdsSingle] = useState({
    xl: 80,
    large: 60,
    medium: 40,
    small: 20,
  });
  const [colorThresholdsSingle, setColorThresholdsSingle] = useState({
    ff5555: 80,
    ff8c69: 60,
    ffb78d: 40,
    ffdcc0: 20,
  });

  const [quantityPValueThreshold, setQuantityPValueThreshold] = useState(1);
  const previousQuantityPValueThreshold = useRef<number>(
    quantityPValueThreshold
  );

  const [fractionalPValueThreshold, setFractionalPValueThreshold] = useState(1);
  const previousFractionalPValueThreshold = useRef<number>(
    fractionalPValueThreshold
  );

  const [singleExperimentMode, setSingleExperimentMode] = useState(false);
  const previousSingleExperimentMode = useRef<boolean>(singleExperimentMode);

  //fcose options
  const [quality, setQuality] = useState("default");
  const [incremental, setIncremental] = useState(true);
  const [animate, setAnimate] = useState(true);
  const [fit, setFit] = useState(true);
  const [uniformNodeDimensions, setUniformNodeDimensions] = useState(false);
  const [packComponents, setPackComponents] = useState(true);
  const [tileDisconnected, setTileDisconnected] = useState(false);
  const [nodeRepulsion, setNodeRepulsion] = useState(4500);
  const [idealEdgeLength, setIdealEdgeLength] = useState(200);
  const [edgeElasticity, setEdgeElasticity] = useState(1);
  const [nestingFactor, setNestingFactor] = useState(0.6);
  const [gravity, setGravity] = useState(0.25);
  const [gravityRange, setGravityRange] = useState(3.8);
  const [compoundGravity, setCompoundGravity] = useState(1);
  const [compoundGravityRange, setCompoundGravityRange] = useState(1.5);
  const [numIter, setNumIter] = useState(2500);
  const [tilingPaddingVertical, setTilingPaddingVertical] = useState(10);
  const [tilingPaddingHorizontal, setTilingPaddingHorizontal] = useState(10);
  const [coolingFactor, setCoolingFactor] = useState(0.3);

  // Function to handle restyling in cytoscape - you need to implement this
  const applyCytoscapeRestyling = () => {
    if (cy.current) {
      // Update the layout with new settings from state
      const updatedLayout = {
        name: "fcose",
        nodeRepulsion: nodeRepulsion,
        idealEdgeLength: idealEdgeLength,
        edgeElasticity: edgeElasticity,
        nestingFactor: nestingFactor,
        animate: animate,
        // ... include other layout properties that might be controlled by state
      };

      // Run the layout with updated configuration
      cy.current.layout(updatedLayout).run();
    }
  };

  const getOrgPos = (node: cytoscape.NodeSingular) => {
    return Object.assign({}, node.data("orgPos"));
  };
  const highlight = useCallback(
    async (node: cytoscape.NodeSingular) => {
      if (highlightInProgress || !cy.current) return;

      setHighlightInProgress(true);

      const allEles = cy.current.elements();
      const nhood = (lastHighlighted.current = node.closedNeighborhood());
      const others = (lastUnhighlighted.current = allEles.not(nhood));

      const showOverview = () => {
        if (!cy.current) {
          return;
        }
        cy.current.batch(() => {
          allEles.removeClass("faded highlighted hidden hiddenTargeted");

          nhood.addClass("highlighted");
          others.addClass("hidden");

          others.positions(getOrgPos);
        });

        const layout = nhood.layout({
          name: "preset",
          positions: getOrgPos,
          fit: true,
          animate: true,
          animationDuration: 500,
          animationEasing: "ease",
          padding: 10,
        });

        layout.run();
        return layout.promiseOn("layoutstop");
      };

      // Function to run layout
      const runLayout = () => {
        const p = getOrgPos(node);

        const layout = nhood.layout({
          name: "concentric",
          fit: true,
          animate: true,
          animationDuration: 500,
          animationEasing: "ease",
          padding: 10,
          boundingBox: {
            x1: p.x - 1,
            x2: p.x + 1,
            y1: p.y - 1,
            y2: p.y + 1,
          },
          avoidOverlap: true,
          concentric: (ele) => (ele.same(node) ? 2 : 1),
          levelWidth: () => 1,
        });

        layout.run();
        return layout.promiseOn("layoutstop");
      };

      // Function to show others faded
      const showOthersFaded = () => {
        if (cy.current) {
          cy.current.batch(() => {
            others.removeClass("hidden").addClass("faded");
          });
        }
      };

      await showOverview();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await runLayout();
      showOthersFaded();

      setHighlightInProgress(false);
    },
    [highlightInProgress]
  );

  const unhighlight = useCallback(async () => {
    if (!lastHighlighted.current || !cy.current) return;

    const allEles = cy.current.elements();
    const nhood = lastHighlighted.current;
    const others = lastUnhighlighted.current;

    // Hide non-neighborhood nodes
    const hideOthers = () => {
      if (others) {
        others.addClass("hidden");
      }
      return Promise.resolve();
    };

    // Reset classes for all elements
    const resetClasses = () => {
      if (cy.current) {
        cy.current.batch(() => {
          allEles.removeClass("hidden faded highlighted");
          allEles.filter(".areHiddenTargeted").addClass("hiddenTargeted");
        });
      }
      return Promise.resolve();
    };

    const animateToOrgPos = () => {
      return Promise.all(
        nhood.nodes().map((n) => {
          return n
            .animation({
              position: getOrgPos(n),
              duration: 500,
              easing: "ease",
            })
            .play()
            .promise();
        })
      );
    };

    const restorePositions = () => {
      if (cy.current) {
        cy.current.batch(() => {
          if (others) {
            others.nodes().positions(getOrgPos);
          }
        });
      }

      return animateToOrgPos();
    };

    await hideOthers();
    await restorePositions();
    await resetClasses();

    lastHighlighted.current = null;
    lastUnhighlighted.current = null;
  }, []);

  // Find min and max of transformed values
  let minValue = Math.min(
    ...networkData.edges.map((c) => c.data.mean_distance)
  );
  let maxValue = Math.max(
    ...networkData.edges.map((c) => c.data.mean_distance)
  );

  // Scale to percentage
  const scaleToPercentage = (value: number, min: number, max: number) =>
    ((value - min) / (max - min)) * 100;

  networkData.edges = networkData.edges.map((connection) => {
    return {
      ...connection,
      data: {
        ...connection.data,
        scaledDistance: scaleToPercentage(
          connection.data.mean_distance,
          minValue,
          maxValue
        ),
      },
    };
  });

  const scaleSize = useCallback(
    (pvalue: number) => {
      if (pvalue < sizeThresholds.xl) {
        return 60;
      } else if (pvalue < sizeThresholds.large) {
        return 50;
      } else if (pvalue < sizeThresholds.medium) {
        return 40;
      } else if (pvalue < sizeThresholds.small) {
        return 30;
      } else {
        return 20;
      }
    },
    [sizeThresholds]
  );

  const scaleColor = useCallback(
    (pvalue: number) => {
      if (pvalue < colorThresholds.ff5555) {
        return "#ff5555";
      } else if (pvalue < colorThresholds.ff8c69) {
        return "#ff8c69";
      } else if (pvalue < colorThresholds.ffb78d) {
        return "#ffb78d";
      } else if (pvalue < colorThresholds.ffdcc0) {
        return "#ffdcc0";
      } else {
        return "#ffffff";
      }
    },
    [colorThresholds]
  );

  const [selectedAttribute, setSelectedAttribute] = useState<
    "quantification" | "fc"
  >("quantification");
  const [selectedExperiment, setSelectedExperiment] = useState<string>("");
  const [sortedData, setSortedData] = useState<{
    quantification: Record<
      string,
      { name: string; id: string; maxValue: number | string }[]
    >;
    fc: Record<
      string,
      { name: string; id: string; maxValue: number | string }[]
    >;
  }>({
    quantification: {},
    fc: {},
  });

  const processNodeData = useCallback(
    (networkData: NetworkData, attribute: keyof NodeData) => {
      const getMaxValueForExperiment = (
        nodeData: NodeData,
        attribute: keyof NodeData,
        experiment: string
      ) => {
        const attrData = nodeData[attribute] as
          | QuantProps[]
          | FractionalContributionProps[]
          | undefined;
        if (!attrData) {
          return 0; // Return a default value (e.g., 0) if the attribute data is not present
        }
        const data =
          attrData.find((d) => d.experiment === experiment)?.value || [];
        return Math.max(...data);
      };

      // Aggregate nodes by experiment and find the maximum value for the given attribute
      let nodesByExperiment: Record<
        string,
        { name: string; id: string; maxValue: number }[]
      > = {};
      networkData.nodes.forEach((node) => {
        if (node) {
          const attributeData = (node.data[attribute] || []) as
            | QuantProps[]
            | FractionalContributionProps[];
          attributeData.forEach((attr) => {
            const experiment = attr.experiment;
            const maxValue = getMaxValueForExperiment(
              node.data,
              attribute,
              experiment
            );
            if (!nodesByExperiment[experiment]) {
              nodesByExperiment[experiment] = [];
            }
            nodesByExperiment[experiment].push({
              name: node.data.name,
              id: node.data.id,
              maxValue: maxValue,
            });
          });
        }
      });

      // Sort nodes within each experiment group by their maximum value in descending order
      Object.keys(nodesByExperiment).forEach((experiment) => {
        nodesByExperiment[experiment].sort((a, b) => b.maxValue - a.maxValue);
      });

      return nodesByExperiment;
    },
    []
  );

  useEffect(() => {
    const sortedQuantData = processNodeData(networkData, "quantification");
    const sortedFcData = processNodeData(networkData, "fc");
    setSortedData({
      quantification: sortedQuantData,
      fc: sortedFcData,
    });
  }, [networkData, processNodeData]);

  useEffect(() => {
    if (experiments.length > 0) {
      setSelectedExperiment(experiments[0]);
    }
  }, [experiments]);

  const data = React.useMemo(() => {
    return sortedData[selectedAttribute][selectedExperiment] || [];
  }, [sortedData, selectedAttribute, selectedExperiment]);

  const getMaxValueForExperiment = (
    ele: cytoscape.NodeSingular,
    attribute: string,
    experiment: string
  ) => {
    const data =
      ele.data(attribute).find((d: any) => d.experiment === experiment)
        ?.value || [];

    return Math.max(...data);
  };

  const [scaleAll, setScaleAll] = useState(false);
  const previousScaleAll = useRef<boolean>(scaleAll);

  const { globalQuantMax, globalFcMax } = useMemo(() => {
    let globalQuantMax = 0;
    let globalFcMax = 0;

    networkData.nodes.forEach((node) => {
      const quantData =
        node.data.quantification?.find(
          (d) => d.experiment === activeExperiments[0]
        )?.value || [];
      const fcData =
        node.data.fc?.find((d) => d.experiment === activeExperiments[0])
          ?.value || [];
      const nodeQuantMax = Math.max(...quantData, 0);
      const nodeFcMax = Math.max(...fcData, 0);
      if (nodeQuantMax > globalQuantMax) {
        globalQuantMax = nodeQuantMax;
      }
      if (nodeFcMax > globalFcMax) globalFcMax = nodeFcMax;
    });
    // Return an object with both values
    return { globalQuantMax, globalFcMax };
  }, [networkData, activeExperiments]);

  const { globalQuantMaxAll, globalFcMaxAll } = useMemo(() => {
    let globalQuantMaxAll = 0;
    let globalFcMaxAll = 0;

    networkData.nodes.forEach((node) => {
      // Iterate over all quantification values and find the max
      node.data.quantification?.forEach((quant) => {
        const nodeQuantMax = Math.max(...quant.value, 0); // Assuming `quant.value` is an array
        if (nodeQuantMax > globalQuantMaxAll) {
          globalQuantMaxAll = nodeQuantMax;
        }
      });

      // Iterate over all fc values and find the max
      node.data.fc?.forEach((fc) => {
        const nodeFcMax = Math.max(...fc.value, 0); // Assuming `fc.value` is an array
        if (nodeFcMax > globalFcMaxAll) {
          globalFcMaxAll = nodeFcMax;
        }
      });
    });

    return { globalQuantMaxAll, globalFcMaxAll };
  }, [networkData]);

  const scaleColorSingle = useCallback(
    (value: number, maxValue: number) => {
      const percentage = (value / maxValue) * 100;
      if (percentage >= colorThresholdsSingle.ff5555) return "#ff5555";
      if (percentage >= colorThresholdsSingle.ff8c69) return "#ff8c69";
      if (percentage >= colorThresholdsSingle.ffb78d) return "#ffb78d";
      if (percentage >= colorThresholdsSingle.ffdcc0) return "#ffdcc0";
      return "#ffffff";
    },
    [colorThresholdsSingle]
  );

  const scaleSizeSingle = useCallback(
    (value: number, maxValue: number) => {
      const percentage = (value / maxValue) * 100;
      if (percentage >= sizeThresholdsSingle.xl) return 100;
      if (percentage >= sizeThresholdsSingle.large) return 80;
      if (percentage >= sizeThresholdsSingle.medium) return 60;
      if (percentage >= sizeThresholdsSingle.small) return 40;
      return 20;
    },
    [sizeThresholdsSingle]
  );

  const getNodeStyle = useCallback((): Stylesheet[] => {
    const nodeBackgroundColor = themePalette["base-300"];
    const nodeStyle: Stylesheet = {
      selector: "node",
      style: {
        label: "data(name)",
        color: themePalette["base-content"],
        "background-color": nodeBackgroundColor,
        width: 20,
        height: 20,
      },
    };

    // Conditionally set style based on mode
    let conditionalStyles: Stylesheet[] = [];
    if (singleExperimentMode && activeExperiments.length > 0) {
      const activeExperiment = activeExperiments[0];

      let maxFc: number;
      let maxQuant: number;
      if (scaleAll) {
        maxFc = globalFcMaxAll;
        maxQuant = globalQuantMaxAll;
      } else {
        maxFc = globalFcMax;
        maxQuant = globalQuantMax;
      }

      conditionalStyles.push({
        selector: "node.unknown",
        style: {
          "background-color": (ele: cytoscape.NodeSingular) => {
            const maxValue = getMaxValueForExperiment(
              ele,
              "fc",
              activeExperiment
            );
            return scaleColorSingle(maxValue, maxFc);
          },
          width: (ele: cytoscape.NodeSingular) => {
            const maxValue = getMaxValueForExperiment(
              ele,
              "quantification",
              activeExperiment
            );
            return scaleSizeSingle(maxValue, maxQuant);
          },
          height: (ele: cytoscape.NodeSingular) => {
            const maxValue = getMaxValueForExperiment(
              ele,
              "quantification",
              activeExperiment
            );
            return scaleSizeSingle(maxValue, maxQuant);
          },
        },
      });

      conditionalStyles.push({
        selector: "node.mapped",
        style: {
          "background-color": (ele: cytoscape.NodeSingular) => {
            const maxValue = getMaxValueForExperiment(
              ele,
              "fc",
              activeExperiment
            );
            return scaleColorSingle(maxValue, maxFc);
          },
          width: (ele: cytoscape.NodeSingular) => {
            const maxValue = getMaxValueForExperiment(
              ele,
              "quantification",
              activeExperiment
            );
            return scaleSizeSingle(maxValue, maxQuant);
          },
          height: (ele: cytoscape.NodeSingular) => {
            const maxValue = getMaxValueForExperiment(
              ele,
              "quantification",
              activeExperiment
            );
            return scaleSizeSingle(maxValue, maxQuant);
          },
        },
      });
    } else {
      conditionalStyles.push({
        selector: "node.mapped",
        style: {
          "background-color": (ele: cytoscape.NodeSingular) =>
            scaleColor(ele.data("fc_variability")),
          width: (ele: cytoscape.NodeSingular) =>
            scaleSize(ele.data("pool_variability")),
          height: (ele: cytoscape.NodeSingular) =>
            scaleSize(ele.data("pool_variability")),
        },
      });
      conditionalStyles.push({
        selector: "node.unknown",
        style: {
          "background-color": (ele: cytoscape.NodeSingular) =>
            scaleColor(ele.data("fc_variability")),
          width: (ele: cytoscape.NodeSingular) =>
            scaleSize(ele.data("pool_variability")),
          height: (ele: cytoscape.NodeSingular) =>
            scaleSize(ele.data("pool_variability")),
        },
      });
    }

    return [nodeStyle, ...conditionalStyles];
  }, [
    scaleColor,
    scaleSize,
    activeExperiments,
    globalFcMax,
    globalQuantMax,
    singleExperimentMode,
    scaleAll,
    globalFcMaxAll,
    globalQuantMaxAll,
    scaleColorSingle,
    scaleSizeSingle,
  ]);

  const getEdgeStyle = useCallback((): Stylesheet[] => {
    const edgeBackgroundColor: string = themePalette["base-300"];

    const edgeStyle: Stylesheet = {
      selector: "edge",
      style: {
        "line-color": (ele: cytoscape.EdgeSingular) => {
          const experimentIndex = ele.data("experiment");
          return experimentColorMap[experimentIndex] || edgeBackgroundColor; // default color if not found
        },
        "curve-style": "bezier",
      },
    };

    return [edgeStyle];
  }, [experimentColorMap]);

  const updateCytoscapeStyles = useCallback(() => {
    const newStyles = [
      ...configUnknown.style,
      ...getNodeStyle(),
      ...getEdgeStyle(),
    ];
    if (cy.current) {
      cy.current.style(newStyles);
    }
  }, [getEdgeStyle, getNodeStyle]);

  const saveJsonToFile = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    // Create a link and set the URL as the href
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "download.json";

    // Append link to the body, trigger click, and then remove it
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up by revoking the object URL
    URL.revokeObjectURL(url);
  };

  const handleDownload = () => {
    const currentDate = new Date();
    const formattedDate = currentDate
      .toISOString()
      .replace(/:\s*/g, "-")
      .split(".")[0];
    const filename = `networkdata_${formattedDate}.json`;
    saveJsonToFile(networkData, filename);
  };

  const handleCytoscapeJsonDownload = () => {
    const currentDate = new Date();
    const formattedDate = currentDate
      .toISOString()
      .replace(/:\s*/g, "-")
      .split(".")[0];
    const filename = `networkgraph_${formattedDate}.json`;
    if (cy.current) {
      const jsonExport = cy.current.json();
      saveJsonToFile(jsonExport, filename);
    }
  };

  const savePngToFile = (data: string, filename: string) => {
    const a = document.createElement("a");
    a.href = data;
    a.download = filename || "download.png";

    // Append link to the body, trigger click, and then remove it
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCytoscapeImageDownload = () => {
    const currentDate = new Date();
    const formattedDate = currentDate
      .toISOString()
      .replace(/:\s*/g, "-")
      .split(".")[0];
    const filename = `networkgraph_${formattedDate}.png`;
    if (cy.current) {
      const imageBase64 = cy.current.png();
      savePngToFile(imageBase64, filename);
    }
  };

  const getNodeEdges = useCallback((node: cytoscape.NodeSingular) => {
    const nodeId = node.id();
    const connectedEdges = node.connectedEdges().jsons();
    const connectedRemovedEdges = removedEdgesRef.current.filter(
      (edge) => edge.data.source === nodeId || edge.data.target === nodeId
    );
    let combinedEdges = connectedEdges
      .concat(connectedRemovedEdges)
      .map((jsonEdge) => ({
        source: jsonEdge.data.source,
        target: jsonEdge.data.target,
        experiment: jsonEdge.data.experiment,
        connections: jsonEdge.data.connections,
        min_distance: jsonEdge.data.min_distance,
        max_distance: jsonEdge.data.max_distance,
        mean_distance: jsonEdge.data.mean_distance,
        median_distance: jsonEdge.data.median_distance,
        scaledDistance: jsonEdge.data.scaledDistance,
        id: jsonEdge.data.id,
      }));

    return combinedEdges;
  }, []);

  const selectNode = useCallback(
    (nodeId: string) => {
      if (!cy.current) {
        console.log("Cytoscape instance is not available");
        return;
      }
      const node = cy.current.getElementById(nodeId);

      if (node.length === 0) {
        const removedNode = removedNodesRef.current.find(
          (n) => n.id() === nodeId
        );
        if (removedNode) {
          const nodeData = removedNode.data();
          setSelectedNodeData(nodeData);

          let nodeEdges = getNodeEdges(removedNode);

          setSelectedNodeDataEdges(nodeEdges);
        } else {
          return;
        }
      } else {
        const nodeData = node.data();
        setSelectedNodeData(nodeData);
        let nodeEdges = getNodeEdges(node);

        setSelectedNodeDataEdges(nodeEdges);
      }
    },
    [getNodeEdges]
  );

  const handleHover = useCallback((nodeId: string) => {
    if (!cy.current) return;

    const node = cy.current.getElementById(nodeId);
    const allEles = cy.current.elements();
    const nhood = node.closedNeighborhood();
    const others = allEles.not(nhood);

    cy.current.batch(() => {
      others.addClass("unhovered");
      nhood.removeClass("unhovered");
      node.addClass("hovered").removeClass("unhovered");
    });
  }, []);

  // Function to handle unhover
  const handleUnhover = useCallback(() => {
    if (!cy.current) return;

    cy.current.batch(() => {
      if (cy.current) {
        cy.current.elements().removeClass("hovered unhovered");
      }
    });
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    cytoscape.CollectionReturnValue | undefined
  >(undefined);

  const minSimilarityValue = 0; // Adjust as needed
  const minMetricValue = 0.25; // Adjust as needed

  const updateSearch = useCallback(() => {
    if (!cy.current) return [];

    const getWords = (str: string) => str.toLowerCase().split(/\s+/);
    const queryWords = getWords(searchQuery);
    const getStringSimilarity = (queryWord: string, nodeWord: string) => {
      const index = nodeWord.indexOf(queryWord);

      if (index === 0) {
        const diff = Math.abs(nodeWord.length - queryWord.length);
        const maxLength = Math.max(nodeWord.length, queryWord.length);

        return 1 - diff / maxLength;
      } else {
        return 0;
      }
    };

    const getMetric = (node: cytoscape.NodeSingular, queryWords: string[]) => {
      const nodeWord = node.data("name").toLowerCase();
      let score = 0;
      for (let j = 0; j < queryWords.length; j++) {
        let queryWord = queryWords[j];
        let similarity = getStringSimilarity(queryWord, nodeWord);

        if (similarity > minSimilarityValue) {
          score += similarity;
        }
      }
      return score;
    };

    let searchMatchNodes = cy.current
      .nodes()
      .filter((node) => {
        return getMetric(node, queryWords) > minMetricValue;
      })
      .sort((nodeA, nodeB) => {
        return (
          getMetric(nodeB as cytoscape.NodeSingular, queryWords) -
          getMetric(nodeA as cytoscape.NodeSingular, queryWords)
        );
      });

    setSearchResults(searchMatchNodes);
  }, [searchQuery, minSimilarityValue, minMetricValue]);

  function debounce(func: (...args: any[]) => void, delay: number) {
    let debounceTimer: NodeJS.Timeout;

    return (...args: any[]) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        func(...args);
      }, delay);
    };
  }

  const debouncedSearch = useCallback(() => {
    // Debounce the updateSearch function inside useCallback
    const debouncedUpdate = debounce(() => {
      updateSearch();
    }, 300);

    // Call the debounced function
    debouncedUpdate();
  }, [updateSearch]); //

  useEffect(() => {
    if (searchQuery.length >= 2) {
      debouncedSearch();
    } else {
      setSearchResults(undefined);
    }
  }, [searchQuery, debouncedSearch]);

  const handleNodeClick = (nodeId: string) => {
    if (!cy.current) return;

    const cyNode = cy.current.getElementById(nodeId);

    if (cyNode) {
      cyNode.trigger("tap");
    }
  };

  useEffect(() => {
    if (!cy.current) {
      return;
    }

    if (
      previousDistanceThreshold.current !== distanceThreshold ||
      activeExperiments !== previousActiveExperiments.current ||
      connectionThreshold !== previousConnectionThreshold.current
    ) {
      if (mode === "unknown") {
        const preCheckEdgesAndAddNodes = () => {
          removedEdgesRef.current.forEach((edge) => {
            if (
              edge.data.scaledDistance <= distanceThreshold &&
              activeExperiments.includes(edge.data.experiment) &&
              Object.keys(edge.data.connections).length >= connectionThreshold
            ) {
              // Add source and target nodes of the edge if they are not present
              const sourceId = edge.data.source;
              const targetId = edge.data.target;

              if (cy.current) {
                if (!cy.current.getElementById(sourceId).length) {
                  const sourceNode = removedNodesRef.current.find(
                    (node) => node.data("id") === sourceId
                  );
                  if (sourceNode) {
                    cy.current.add(sourceNode);
                    removedNodesRef.current = removedNodesRef.current.filter(
                      (n) => n.data("id") !== sourceId
                    );
                  }
                }

                if (!cy.current.getElementById(targetId).length) {
                  const targetNode = removedNodesRef.current.find(
                    (node) => node.data("id") === targetId
                  );
                  if (targetNode) {
                    cy.current.add(targetNode);
                    removedNodesRef.current = removedNodesRef.current.filter(
                      (n) => n.data("id") !== targetId
                    );
                  }
                }
              }
            }
          });
        };

        const updateEdges = () => {
          if (!cy.current) {
            return;
          }
          // Remove edges that exceed the threshold and store them
          cy.current.edges().forEach((edge) => {
            const connections = edge.data("connections");

            if (
              edge.data("scaledDistance") > distanceThreshold ||
              !activeExperiments.includes(edge.data("experiment"))
            ) {
              removedEdgesRef.current.push(edge.json() as EdgeProps);

              edge.remove();
            }
            if (Object.keys(connections).length < connectionThreshold) {
              removedEdgesRef.current.push(edge.json() as EdgeProps);
              edge.remove();
            }
          });

          // Re-add edges that are now within the threshold
          removedEdgesRef.current = removedEdgesRef.current.filter((edge) => {
            if (
              cy.current &&
              edge.data.scaledDistance <= distanceThreshold &&
              cy.current.getElementById(edge.data.source).length > 0 &&
              cy.current.getElementById(edge.data.target).length > 0 &&
              activeExperiments.includes(edge.data.experiment) &&
              Object.keys(edge.data.connections).length >= connectionThreshold
            ) {
              cy.current.add(edge); // Re-add edge
              return false; // Remove from removedEdgesRef
            }
            return true;
          });
        };

        const updateNodes = () => {
          if (!cy.current) {
            return;
          }
          // Remove nodes with no edges if edgelessNodes is false

          cy.current.nodes().forEach((node) => {
            if (node.connectedEdges().length === 0) {
              removedNodesRef.current.push(node.remove());
            }
          });
        };
        preCheckEdgesAndAddNodes();
        updateEdges();
        updateNodes();
      }
    }

    if (activeExperiments !== previousActiveExperiments.current) {
      if (mode === "target") {
        const preCheckEdgesAndAddNodes = () => {
          removedEdgesRef.current.forEach((edge) => {
            if (
              activeExperiments.includes(edge.data.experiment) ||
              edge.data.experiment === "pathway"
            ) {
              const sourceId = edge.data.source;
              const targetId = edge.data.target;

              if (cy.current) {
                if (!cy.current.getElementById(sourceId).length) {
                  const sourceNode = removedNodesRef.current.find(
                    (node) => node.data("id") === sourceId
                  );
                  if (sourceNode) {
                    cy.current.add(sourceNode);
                    removedNodesRef.current = removedNodesRef.current.filter(
                      (n) => n.data("id") !== sourceId
                    );
                  }
                }

                if (!cy.current.getElementById(targetId).length) {
                  const targetNode = removedNodesRef.current.find(
                    (node) => node.data("id") === targetId
                  );
                  if (targetNode) {
                    cy.current.add(targetNode);
                    removedNodesRef.current = removedNodesRef.current.filter(
                      (n) => n.data("id") !== targetId
                    );
                  }
                }
              }
            }
          });
        };

        const updateEdges = () => {
          if (!cy.current) {
            return;
          }
          // Remove edges that exceed the threshold and store them
          cy.current.edges().forEach((edge) => {
            const connections = edge.data("connections");

            if (
              !activeExperiments.includes(edge.data("experiment")) &&
              edge.data("experiment") !== "pathway"
            ) {
              removedEdgesRef.current.push(edge.json() as EdgeProps);

              edge.remove();
            }
          });

          // Re-add edges that are now within the threshold
          removedEdgesRef.current = removedEdgesRef.current.filter((edge) => {
            if (
              cy.current &&
              cy.current.getElementById(edge.data.source).length > 0 &&
              cy.current.getElementById(edge.data.target).length > 0 &&
              activeExperiments.includes(edge.data.experiment)
            ) {
              cy.current.add(edge); // Re-add edge
              return false; // Remove from removedEdgesRef
            }
            return true;
          });
        };

        const updateNodes = () => {
          if (!cy.current) {
            return;
          }
          // Remove nodes with no edges if edgelessNodes is false

          cy.current.nodes().forEach((node) => {
            if (node.connectedEdges().length === 0) {
              removedNodesRef.current.push(node.remove());
            }
          });
        };
        preCheckEdgesAndAddNodes();
        updateEdges();
        updateNodes();
      }
    }

    if (
      quantityPValueThreshold !== previousQuantityPValueThreshold.current ||
      fractionalPValueThreshold !== previousFractionalPValueThreshold.current
    ) {
      const filterNodesByQuantityAndFractionalPValues = () => {
        if (!cy.current) return;

        cy.current.nodes().forEach((node) => {
          const quantityPValue = node.data("pool_variability");
          const fractionalPValue = node.data("fc_variability");

          // Check if the node does not meet the threshold criteria
          if (
            quantityPValue > quantityPValueThreshold ||
            fractionalPValue > fractionalPValueThreshold
          ) {
            node.addClass("hidden");
            node.connectedEdges().addClass("hidden");
          } else if (
            quantityPValue <= quantityPValueThreshold ||
            fractionalPValue <= fractionalPValueThreshold
          ) {
            node.removeClass("hidden");
            node.connectedEdges().removeClass("hidden");
          }
        });
      };
      if (mode === "unknown") {
        filterNodesByQuantityAndFractionalPValues();
      }
    }

    if (
      cy.current &&
      singleExperimentMode !== previousSingleExperimentMode.current
    ) {
      if (singleExperimentMode) {
        setActiveExperiments([experiments[0]]);
      } else {
        setActiveExperiments(experiments);
      }

      updateCytoscapeStyles();
    } else if (
      cy.current &&
      activeExperiments !== previousActiveExperiments.current
    ) {
      if (singleExperimentMode) {
        updateCytoscapeStyles();
      }
    } else if (cy.current && scaleAll !== previousScaleAll.current) {
      if (singleExperimentMode) {
        updateCytoscapeStyles();
      }
    }

    previousDistanceThreshold.current = distanceThreshold;
    previousActiveExperiments.current = activeExperiments;
    previousConnectionThreshold.current = connectionThreshold;
    previousQuantityPValueThreshold.current = quantityPValueThreshold;
    previousFractionalPValueThreshold.current = fractionalPValueThreshold;
    previousSingleExperimentMode.current = singleExperimentMode;
    previousScaleAll.current = scaleAll;
  }, [
    distanceThreshold,
    previousDistanceThreshold,
    activeExperiments,
    previousActiveExperiments,
    connectionThreshold,
    previousConnectionThreshold,
    quantityPValueThreshold,
    previousQuantityPValueThreshold,
    fractionalPValueThreshold,
    previousFractionalPValueThreshold,
    mode,
    singleExperimentMode,
    previousSingleExperimentMode,
    experiments,
    updateCytoscapeStyles,
    scaleAll,
    previousScaleAll,
  ]);

  const handlerTapHighlight = useCallback(
    (evt: cytoscape.EventObject) => {
      highlight(evt.target);
    },
    [highlight]
  );

  const handlerTap = useCallback(
    (evt: cytoscape.EventObject) => {
      handleHover(evt.target.id());
    },
    [handleHover]
  );

  const handlerUnTapHighlight = useCallback(
    (evt: cytoscape.EventObject) => {
      if (evt.target === cy.current) {
        unhighlight();
      }
    },
    [unhighlight]
  );

  const handlerUnTap = useCallback(
    (evt: cytoscape.EventObject) => {
      if (evt.target === cy.current) {
        handleUnhover();
      }
    },
    [handleUnhover]
  );

  const handlerSelectNode = useCallback(
    (evt: cytoscape.EventObject) => {
      const nodeData = evt.target.data();
      const nodeEdges = getNodeEdges(evt.target);

      setSelectedNodeData(nodeData);
      setSelectedNodeDataEdges(nodeEdges);
    },
    [getNodeEdges, setSelectedNodeData, setSelectedNodeDataEdges]
  );

  const handlerSelectEdge = (evt: cytoscape.EventObject) => {
    const edgeData = evt.target.data();
    setSelectedEdgeData(edgeData);
  };

  const startGraphUnknown = useCallback(() => {
    const clonedData = JSON.parse(JSON.stringify(networkData));

    cy.current = cytoscape({
      container: cyRef.current,
      elements: [...clonedData.nodes, ...clonedData.edges],
      style: [...configUnknown.style, ...getNodeStyle(), ...getEdgeStyle()],
      layout: configUnknown.layout,
    });

    cy.current.nodes().forEach((node) => {
      const typeData = node.data("type");

      node.data("orgPos", {
        x: node.position().x,
        y: node.position().y,
      });

      if (typeData === "pathway") {
        node.addClass("pathway");
      } else if (typeData === "unknown") {
        node.addClass("unknown");
      } else if (typeData === "mapped") {
        node.addClass("mapped");
      }
    });

    const updateEdgesOnLoad = () => {
      if (!cy.current) {
        return;
      }

      cy.current.edges().forEach((edge) => {
        if (
          edge.data("scaledDistance") > distanceThreshold ||
          edge.data("experiment") === "pathway"
        ) {
          const jsonData = edge.json();
          const edgeProps: EdgeProps = {
            data: {
              source: jsonData.data.source,
              target: jsonData.data.target,
              experiment: jsonData.data.experiment,
              connections: jsonData.data.connections,
              min_distance: jsonData.data.min_distance,
              max_distance: jsonData.data.max_distance,
              mean_distance: jsonData.data.mean_distance,
              median_distance: jsonData.data.median_distance,
              scaledDistance: jsonData.data.scaledDistance,
              id: jsonData.data.id,
            },
            position: {
              x: jsonData.position.x,
              y: jsonData.position.y,
            },
            group: "edges",
          };
          removedEdgesRef.current.push(edgeProps);

          edge.remove();
        }
      });
    };

    const updateNodesOnLoad = () => {
      if (!cy.current) {
        return;
      }

      cy.current.nodes().forEach((node) => {
        if (
          (node.data("type") === "unknown" || node.data("type") === "mapped") &&
          node.connectedEdges().length === 0
        ) {
          removedNodesRef.current.push(node);

          node.remove();
        } else if (node.data("type") === "pathway") {
          removedNodesRef.current.push(node);

          node.remove();
        }
      });
    };

    updateEdgesOnLoad();
    updateNodesOnLoad();
  }, [networkData, getNodeStyle, getEdgeStyle, distanceThreshold]);

  useEffect(() => {
    if (!cy.current) {
      startGraphUnknown();

      if (cy.current) {
        (cy.current as cytoscape.Core).on("tap", "node", handlerSelectNode);
        (cy.current as cytoscape.Core).on("tap", handlerUnTap);
        (cy.current as cytoscape.Core).on("tap", "node", handlerTap);
        (cy.current as cytoscape.Core).on("tap", "edge", handlerSelectEdge);
      }
    }

    if (mode !== previousMode.current) {
      if (mode === "target") {
        const updateGraph = () => {
          const clonedData = JSON.parse(JSON.stringify(networkData));
          cy.current = cytoscape({
            container: cyRef.current,
            elements: [...clonedData.nodes, ...clonedData.edges],
            style: [
              ...configTargeted.style,
              ...getNodeStyle(),
              ...getEdgeStyle(),
            ],
            layout: configTargeted.layout,
          });

          cy.current.nodes().forEach((node) => {
            const typeData = node.data("type");

            // Store the original position
            node.data("orgPos", {
              x: node.position().x,
              y: node.position().y,
            });

            if (typeData === "pathway") {
              node.addClass("pathway");
            } else if (typeData === "unknown") {
              node.addClass("unknown");
            } else if (typeData === "mapped") {
              node.addClass("mapped");
            }
          });

          removedNodesRef.current = [];
          removedEdgesRef.current = [];

          const nodesToKeep = cy.current.nodes(".pathway, .mapped");
          const neighbors = nodesToKeep.closedNeighborhood();
          const elementsToRemove = cy.current.elements().not(neighbors);

          elementsToRemove.forEach((element) => {
            element.remove();
          });
          const edgesBetweenNodesToKeep = nodesToKeep.edgesWith(nodesToKeep);

          cy.current
            .elements()
            .not(nodesToKeep.union(edgesBetweenNodesToKeep))
            .addClass("hiddenTargeted areHiddenTargeted");

          cy.current.edges().forEach((edge) => {
            if (edge.data("experiment") !== "pathway") {
              edge.addClass("hiddenTargeted areHiddenTargeted");
            }
          });
        };

        updateGraph();
      } else if (mode === "unknown") {
        startGraphUnknown();
      }
    }

    if (
      cy.current &&
      (hightlightMode !== previousHighlightMode.current ||
        mode !== previousMode.current)
    ) {
      if (hightlightMode) {
        handleUnhover();
        cy.current.off("tap");
        cy.current.on("tap", "node", handlerTapHighlight);
        cy.current.on("tap", handlerUnTapHighlight);
      } else {
        unhighlight();
        cy.current.off("tap");
        cy.current.on("tap", "node", handlerTap);
        cy.current.on("tap", handlerUnTap);
      }

      cy.current.on("tap", "node", handlerSelectNode);
      cy.current.on("tap", "edge", function (evt) {
        const edgeData = evt.target.data();
        setSelectedEdgeData(edgeData);
      });
    }
    previousMode.current = mode;
    previousHighlightMode.current = hightlightMode;
  }, [
    mode,
    previousMode,
    getNodeStyle,
    getEdgeStyle,
    highlight,
    hightlightMode,
    previousHighlightMode,
    unhighlight,
    networkData,
    distanceThreshold,
    handlerTap,
    handlerTapHighlight,
    handlerUnTap,
    handlerUnTapHighlight,
    handlerSelectNode,
    startGraphUnknown,
    experiments,
    handleUnhover,
  ]);

  interface TableData {
    name: string;
    id: string;
    maxValue: number | string;
  }

  type TableColumn = Column<TableData>;

  const columns: TableColumn[] = React.useMemo(
    () => [
      {
        Header: "Name",
        // Use the accessor to get the correct field from your data
        accessor: "name",
        // Custom cell rendering
        Cell: ({ row }: CellProps<TableData>) => {
          // Destructure the original row value to get node data
          const node = row.original;
          // Determine the display name: use node.name if it's not an empty string; otherwise, use node.id
          const displayName = node.name !== "" ? node.name : node.id;
          return (
            <button
              className="btn btn-link"
              onClick={() => selectNode(node.id)}
            >
              {displayName}
            </button>
          );
        },
      },
      {
        Header: "Max Value",
        accessor: "maxValue",
        Cell: ({ value }) => {
          // Check if value is a number and format it; otherwise, return the value directly
          const formattedValue =
            typeof value === "number" ? value.toFixed(2) : value;
          return <span>{formattedValue}</span>;
        },
      },
      // Add more columns as needed
    ],
    [selectNode]
  );

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    prepareRow,
    page,
    canPreviousPage,
    canNextPage,
    pageOptions,
    pageCount,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
    state: { pageIndex, pageSize },
  } = useTable({ columns, data }, useSortBy, usePagination) as any;

  return (
    <div className="graph">
      <div
        className="shadow-lg rounded-lg"
        style={{ display: "flex", width: "100%", marginBottom: "2rem" }}
      >
        <div className={`${open ? "w-4/6" : "w-full"} bg-base-200 `}>
          <ModeSwitcher activeMode={mode} setActiveMode={setMode} />
          <div ref={cyRef} style={{ height: "900px" }} className={`p-4`} />
        </div>
        <div
          className={`${
            open ? "w-2/6" : "w-20"
          } pt-8 p-5 duration-300 relative`}
          style={{ maxHeight: "900px" }}
        >
          <BsArrowRightShort
            className={`bg-white text-dark-purple text-3xl rounded-full absolute -left-4 top-9  border border-dark-purple cursor-pointer ${
              !open && "rotate-180"
            }`}
            onClick={() => setOpen(!open)}
          />
          <div
            className="overflow-x-auto"
            style={{ maxHeight: "inherit", overflowY: "auto" }}
          >
            <div className="flex">
              <div className="collapse collapse-arrow">
                <input type="checkbox" />
                <div className="collapse-title inline-flex items-center">
                  <BsGearFill className={`text-2xl mr-1`} />
                  <div
                    className={`text-xl font-medium duration-300 ${
                      !open && "scale-0"
                    }`}
                  >
                    Settings
                  </div>
                </div>
                <div
                  className={`collapse-content space-y-2 ${!open && "scale-0"}`}
                >
                  <div className="flex items-center">
                    <span className="mr-2 font-medium text-md">
                      <span
                        className="tooltip tooltip-right"
                        data-tip="Edge distance threshold."
                      >
                        Distance:
                      </span>
                    </span>

                    <input
                      type="range"
                      min={1}
                      max={100}
                      step={0.1}
                      value={distanceThreshold}
                      onChange={(e) => setDistanceThreshold(+e.target.value)}
                      className="range mr-2"
                      disabled={mode === "target"}
                    />
                    {distanceThreshold.toFixed(2)}
                  </div>
                  <div className="flex items-center">
                    <span className="mr-2 font-medium text-md">
                      <span
                        className="tooltip tooltip-right"
                        data-tip="Minimum number of connections for an edge to be displayed."
                      >
                        Connections:
                      </span>
                    </span>

                    <input
                      type="range"
                      min={1}
                      max={condCombinations}
                      step={1}
                      value={connectionThreshold}
                      onChange={(e) => setConnectionThreshold(+e.target.value)}
                      className="range mr-2"
                      disabled={mode === "target"}
                    />
                    {connectionThreshold}
                  </div>

                  <div className="flex items-center">
                    <span className="mr-2 font-medium text-md">
                      Highlight Mode:
                    </span>
                    <label className="label cursor-pointer">
                      <input
                        className="checkbox"
                        type="checkbox"
                        checked={hightlightMode}
                        onChange={() => setHighlightMode(!hightlightMode)}
                      />
                    </label>
                  </div>

                  <div className="flex items-center">
                    <span className="mr-2 font-medium text-md">
                      Single Experiment Mode:
                    </span>
                    <label className="label cursor-pointer">
                      <input
                        className="checkbox"
                        type="checkbox"
                        checked={singleExperimentMode}
                        onChange={() =>
                          setSingleExperimentMode(!singleExperimentMode)
                        }
                      />
                    </label>
                  </div>

                  {!singleExperimentMode && (
                    <>
                      <div className="flex items-center">
                        <span className="mr-2 font-medium text-md">
                          <span
                            className="tooltip tooltip-right"
                            data-tip="Node quantity pvalue threshold."
                          >
                            Quantity Pvalue:
                          </span>
                        </span>

                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.0001}
                          value={quantityPValueThreshold}
                          onChange={(e) =>
                            setQuantityPValueThreshold(+e.target.value)
                          }
                          className="input input-bordered input-sm max-w-xs"
                          disabled={mode === "target"}
                        />
                      </div>

                      <div className="flex items-center">
                        <span className="mr-2 font-medium text-md">
                          <span
                            className="tooltip tooltip-right"
                            data-tip="Node fractional contribution pvalue threshold."
                          >
                            FC Pvalue:
                          </span>
                        </span>

                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.0001}
                          value={fractionalPValueThreshold}
                          onChange={(e) =>
                            setFractionalPValueThreshold(+e.target.value)
                          }
                          className="input input-bordered input-sm max-w-xs"
                          disabled={mode === "target"}
                        />
                      </div>
                    </>
                  )}

                  {/* <div className="flex items-center">
                  <span className="mr-2 font-medium text-md">
                    Edgeless Nodes:
                  </span>
                  <input
                    type="checkbox"
                    checked={edgelessNodes ? true : false}
                    className="checkbox"
                    onChange={() => setEdgelessNodes(!edgelessNodes)}
                  />
                </div> */}
                  <div className="flex items-center">
                    <span className="mr-2 font-medium text-md">
                      Experiments:
                    </span>
                    {!singleExperimentMode &&
                      experiments.map((experiment) => (
                        <label
                          className="label cursor-pointer"
                          key={experiment}
                        >
                          <span
                            className="mr-1 inline-block w-3 h-3"
                            style={{
                              backgroundColor: experimentColorMap[experiment],
                            }}
                          ></span>
                          <span className="label-text font-semibold">
                            {experiment}
                          </span>
                          <input
                            className="checkbox"
                            type="checkbox"
                            value={experiment}
                            checked={activeExperiments.includes(experiment)}
                            onChange={handleExperimentChange}
                          />
                        </label>
                      ))}
                    {singleExperimentMode && (
                      <select
                        className="select select-bordered w-full max-w-xs"
                        onChange={handleSingleExperimentChange}
                        value={activeExperiments[0] || ""}
                      >
                        {experiments.map((experiment) => (
                          <option key={experiment} value={experiment}>
                            {experiment}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {singleExperimentMode && (
                    <div className="flex items-center">
                      <span className="mr-2 font-medium text-md">
                        Scale Thresholds With All Experiments:
                      </span>
                      <label className="label cursor-pointer">
                        <input
                          className="checkbox"
                          type="checkbox"
                          checked={scaleAll}
                          onChange={() => setScaleAll(!scaleAll)}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex">
              <div className="collapse collapse-arrow">
                <input type="checkbox" />
                <div className="collapse-title inline-flex items-center">
                  <MdDataThresholding className={`text-2xl mr-1`} />
                  <div
                    className={`text-xl font-medium duration-300 ${
                      !open && "scale-0"
                    }`}
                  >
                    Thresholds
                  </div>
                </div>
                <div
                  className={`collapse-content space-y-2 ${!open && "scale-0"}`}
                >
                  <div className="space-y-4">
                    <div className="text-md font-medium">Size Thresholds:</div>
                    <div className="flex flex-col space-y-2">
                      {Object.keys(
                        singleExperimentMode
                          ? sizeThresholdsSingle
                          : sizeThresholds
                      ).map((key) => (
                        <div key={key} className="flex items-center">
                          <span className="mr-2 capitalize">{key}:</span>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            max="1"
                            value={
                              singleExperimentMode
                                ? sizeThresholdsSingle[
                                    key as keyof typeof sizeThresholdsSingle
                                  ]
                                : sizeThresholds[
                                    key as keyof typeof sizeThresholds
                                  ]
                            }
                            onChange={(e) => {
                              const newValue = parseFloat(e.target.value);
                              const updateFunction = singleExperimentMode
                                ? setSizeThresholdsSingle
                                : setSizeThresholds;
                              updateFunction((prev) => ({
                                ...prev,
                                [key]: newValue,
                              }));
                            }}
                            className="input input-bordered input-sm w-full max-w-xs"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="text-md font-medium">Color Thresholds:</div>
                    <div className="flex flex-col space-y-2">
                      {Object.keys(
                        singleExperimentMode
                          ? colorThresholdsSingle
                          : colorThresholds
                      ).map((key) => (
                        <div key={key} className="flex items-center">
                          <span
                            className="mr-1 inline-block w-3 h-3"
                            style={{
                              backgroundColor: `#${key}`,
                            }}
                          ></span>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            max="1"
                            value={
                              singleExperimentMode
                                ? colorThresholdsSingle[
                                    key as keyof typeof colorThresholdsSingle
                                  ]
                                : colorThresholds[
                                    key as keyof typeof colorThresholds
                                  ]
                            }
                            onChange={(e) => {
                              const newValue = parseFloat(e.target.value);
                              const updateFunction = singleExperimentMode
                                ? setColorThresholdsSingle
                                : setColorThresholds;
                              updateFunction((prev) => ({
                                ...prev,
                                [key]: newValue,
                              }));
                            }}
                            className="input input-bordered input-sm w-full max-w-xs"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      className="btn btn-success rounded"
                      onClick={updateCytoscapeStyles}
                    >
                      Apply Changes
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {mode === "unknown" && (
              <div className="flex">
                <div className="collapse collapse-arrow">
                  <input type="checkbox" />
                  <div className="collapse-title inline-flex items-center">
                    <BsLayoutWtf className={`text-2xl mr-1`} />
                    <div
                      className={`text-xl font-medium duration-300 ${
                        !open && "scale-0"
                      }`}
                    >
                      Layout
                    </div>
                  </div>
                  <div
                    className={`collapse-content space-y-2 ${
                      !open && "scale-0"
                    }`}
                  >
                    <div className="cytoscape-options p-4">
                      {/* ... other settings ... */}

                      <div className="form-control">
                        <label className="label">
                          <span className="label-text">Ideal Edge Length</span>
                        </label>
                        <input
                          type="number"
                          className="input input-bordered"
                          value={idealEdgeLength}
                          onChange={(e) =>
                            setIdealEdgeLength(Number(e.target.value))
                          }
                        />
                      </div>

                      <div className="form-control">
                        <label className="label">
                          <span className="label-text">Edge Elasticity</span>
                        </label>
                        <input
                          type="number"
                          className="input input-bordered"
                          value={edgeElasticity}
                          onChange={(e) =>
                            setEdgeElasticity(Number(e.target.value))
                          }
                        />
                      </div>

                      <div className="form-control">
                        <label className="label">
                          <span className="label-text">Nesting Factor</span>
                        </label>
                        <input
                          type="number"
                          className="input input-bordered"
                          value={nestingFactor}
                          onChange={(e) =>
                            setNestingFactor(Number(e.target.value))
                          }
                        />
                      </div>

                      <div className="form-control">
                        <label className="label">
                          <span className="label-text">Node Repulsion</span>
                        </label>
                        <input
                          type="number"
                          className="input input-bordered"
                          value={nodeRepulsion}
                          onChange={(e) =>
                            setNodeRepulsion(Number(e.target.value))
                          }
                        />
                      </div>

                      {/* ... more settings ... */}

                      <div className="form-control mt-4">
                        <button
                          className="btn btn-primary"
                          onClick={applyCytoscapeRestyling}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex">
              <div className="collapse collapse-arrow">
                <input type="checkbox" />
                <div className="collapse-title inline-flex items-center">
                  <FaSearch className={`text-2xl mr-1`} />
                  <div
                    className={`text-xl font-medium duration-300 ${
                      !open && "scale-0"
                    }`}
                  >
                    Search
                  </div>
                </div>
                <div
                  className={`collapse-content space-y-2 ${!open && "scale-0"}`}
                >
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search nodes..."
                    className="input input-bordered w-full"
                  />

                  <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                    {searchResults &&
                      searchResults.map((node, index) => (
                        <div
                          key={index}
                          style={{
                            marginBottom: "10px", // adds spacing between the boxes
                          }}
                        >
                          <button
                            style={{
                              padding: "10px",
                              textAlign: "left",
                              width: "100%",
                              backgroundColor: "#fafafa", // white background for each box
                              border: "1px solid #e5e7eb", // light gray border color
                              borderBottom: "1px solid #e5e7eb",
                              cursor: "pointer",
                            }}
                            onClick={() => handleNodeClick(node.id())}
                          >
                            {node.data("name")}
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {sortedData && (
              <div className="">
                <div className="collapse collapse-arrow">
                  <input type="checkbox" />
                  <div className="collapse-title inline-flex items-center">
                    <FaCircleNodes className={`text-2xl mr-1`} />
                    <div
                      className={`text-xl font-medium duration-300 ${
                        !open && "scale-0"
                      }`}
                    >
                      Ranking
                    </div>
                  </div>
                  <div
                    className={`collapse-content space-y-2 ${
                      !open && "scale-0"
                    }`}
                  >
                    <div className="space-y-4">
                      <div>
                        <label
                          htmlFor="attribute-selection"
                          className="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-400"
                        >
                          Select Attribute
                        </label>
                        <select
                          id="attribute-selection"
                          value={selectedAttribute}
                          onChange={(e) =>
                            setSelectedAttribute(
                              e.target.value as "quantification" | "fc"
                            )
                          }
                          className="select select-bordered w-full max-w-xs"
                        >
                          <option value="quantification">Quantity</option>
                          <option value="fc">Labeling</option>
                        </select>
                      </div>

                      {experiments.length > 0 && (
                        <div>
                          <label
                            htmlFor="experiment-selection"
                            className="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-400"
                          >
                            Select Experiment
                          </label>
                          <select
                            id="experiment-selection"
                            value={selectedExperiment}
                            onChange={(e) =>
                              setSelectedExperiment(e.target.value)
                            }
                            className="select select-bordered w-full max-w-xs"
                          >
                            {experiments.map((experiment) => (
                              <option key={experiment} value={experiment}>
                                {experiment}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="">
                      {/* Table */}
                      <table {...getTableProps()} className="table-auto w-full">
                        <thead>
                          {headerGroups.map(
                            (headerGroup: any, index: number) => (
                              <tr
                                key={index}
                                {...headerGroup.getHeaderGroupProps()}
                              >
                                {headerGroup.headers.map((column: any) => (
                                  <th
                                    key={column.id}
                                    {...column.getHeaderProps(
                                      column.getSortByToggleProps()
                                    )}
                                    className="p-2 cursor-pointer"
                                  >
                                    {column.render("Header")}
                                    <span className="inline-block ml-2">
                                      {column.isSorted ? (
                                        column.isSortedDesc ? (
                                          <FaChevronDown className="w-4 h-4 inline" />
                                        ) : (
                                          <FaChevronUp className="w-4 h-4 inline" />
                                        )
                                      ) : (
                                        <FaChevronUp className="w-4 h-4 inline opacity-50" />
                                      )}
                                    </span>
                                  </th>
                                ))}
                              </tr>
                            )
                          )}
                        </thead>
                        <tbody {...getTableBodyProps()}>
                          {page.map((row: any, index: number) => {
                            prepareRow(row);
                            return (
                              <tr key={index} {...row.getRowProps()}>
                                {row.cells.map((cell: any) => {
                                  return (
                                    <td
                                      key={cell.id}
                                      {...cell.getCellProps()}
                                      className="px-6 py-4 whitespace-nowrap"
                                    >
                                      {cell.render("Cell")}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Pagination */}
                      <div className="flex justify-between items-center my-4">
                        <button
                          onClick={() => gotoPage(0)}
                          disabled={!canPreviousPage}
                          className="btn btn-sm"
                        >
                          {"<<"}
                        </button>
                        <button
                          onClick={() => previousPage()}
                          disabled={!canPreviousPage}
                          className="btn btn-sm"
                        >
                          {"<"}
                        </button>
                        <span>
                          Page <strong>{pageIndex + 1}</strong> of{" "}
                          <strong>{pageOptions.length}</strong>
                        </span>
                        <button
                          onClick={() => nextPage()}
                          disabled={!canNextPage}
                          className="btn btn-sm"
                        >
                          {">"}
                        </button>
                        <button
                          onClick={() => gotoPage(pageCount - 1)}
                          disabled={!canNextPage}
                          className="btn btn-sm"
                        >
                          {">>"}
                        </button>
                        <select
                          value={pageSize}
                          onChange={(e) => setPageSize(Number(e.target.value))}
                          className="select select-bordered select-sm w-50"
                        >
                          {[5, 10, 20, 30, 40, 50].map((pageSize) => (
                            <option key={pageSize} value={pageSize}>
                              Show {pageSize}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedNodeData && (
              <div className="">
                <div className="collapse collapse-arrow">
                  <input type="checkbox" />
                  <div className="collapse-title inline-flex items-center">
                    <BsBarChartLineFill className={`text-2xl mr-1`} />
                    <div
                      className={`text-xl font-medium duration-300 ${
                        !open && "scale-0"
                      }`}
                    >
                      Metabolite Data
                    </div>
                  </div>
                  <div
                    className={`collapse-content space-y-2 ${
                      !open && "scale-0"
                    }`}
                  >
                    {selectedNodeData && (
                      <div>
                        <div className="font-medium text-xl">
                          Name: {selectedNodeData.name}
                        </div>
                        <div className="font-medium text-xl">
                          ID: {selectedNodeData.id}
                        </div>
                        <div className="">
                          mz:{" "}
                          <span className="mz">
                            {selectedNodeData?.mz?.toFixed(4)}
                          </span>{" "}
                          - RT:{" "}
                          <span className="rt">
                            {selectedNodeData?.rt?.toFixed(2)}
                          </span>
                        </div>
                        <div className="tabs mx-auto text-gray-800 ">
                          <a
                            className={
                              activeTab === 0
                                ? "tab tab-active tab-bordered text-lg px-4 py-2 font-semibold"
                                : "tab tab-bordered text-lg px-4 py-2 font-semibold hover:text-gray-900"
                            }
                            onClick={() => setActiveTab(0)}
                          >
                            Quantification
                          </a>
                          <a
                            className={
                              activeTab === 1
                                ? "tab tab-active tab-bordered text-lg px-4 py-2 font-semibold"
                                : "tab tab-bordered text-lg px-4 py-2 font-semibold hover:text-gray-900"
                            }
                            onClick={() => setActiveTab(1)}
                          >
                            MIDs
                          </a>
                          <a
                            className={
                              activeTab === 2
                                ? "tab tab-active tab-bordered text-lg px-4 py-2 font-semibold"
                                : "tab tab-bordered text-lg px-4 py-2 font-semibold hover:text-gray-900"
                            }
                            onClick={() => setActiveTab(2)}
                          >
                            Edges
                          </a>
                        </div>

                        <div className="tabs-content">
                          {activeTab === 0 && (
                            <QuantPlot data={selectedNodeData} />
                          )}
                          {activeTab === 1 && (
                            <MidPlot data={selectedNodeData} />
                          )}
                          {activeTab === 2 && (
                            <div className="">
                              {selectedNodeDataEdges && (
                                <div className="overflow-x-auto h-96">
                                  <table className="table table-xs">
                                    <thead>
                                      <tr>
                                        <th>Source</th>
                                        <td>Target</td>
                                        <td>Experiment</td>
                                        <td>Distance</td>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {selectedNodeDataEdges.map(
                                        (edge, index) => (
                                          <tr key={index}>
                                            <td>
                                              <button
                                                className="btn btn-link"
                                                onClick={() =>
                                                  selectNode(edge.source)
                                                }
                                              >
                                                {edge.source}
                                              </button>
                                            </td>
                                            <td>
                                              <button
                                                className="btn btn-link"
                                                onClick={() =>
                                                  selectNode(edge.target)
                                                }
                                              >
                                                {edge.target}
                                              </button>
                                            </td>
                                            <td>{edge.experiment}</td>
                                            <td>
                                              {edge?.scaledDistance?.toFixed(2)}
                                            </td>
                                          </tr>
                                        )
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {!selectedNodeDataEdges && (
                                <div className="font-medium text-xl">
                                  Sorry no edge data :)
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {selectedEdgeData && (
              <div className="">
                <div className="collapse collapse-arrow">
                  <input type="checkbox" />
                  <div className="collapse-title inline-flex items-center">
                    <SlGraph className={`text-2xl mr-1`} />
                    <div
                      className={`text-xl font-medium duration-300 ${
                        !open && "scale-0"
                      }`}
                    >
                      Connection Data
                    </div>
                  </div>
                  <div
                    className={`collapse-content space-y-2 ${
                      !open && "scale-0"
                    }`}
                  >
                    {selectedEdgeData && (
                      <div>
                        <div className="font-medium text-xl">
                          Edge:{" "}
                          <span className="source">
                            <button
                              className="btn btn-link"
                              onClick={() =>
                                selectNode(selectedEdgeData.source)
                              }
                            >
                              {selectedEdgeData.source}
                            </button>
                          </span>{" "}
                          -{" "}
                          <span className="target">
                            <button
                              className="btn btn-link"
                              onClick={() =>
                                selectNode(selectedEdgeData.target)
                              }
                            >
                              {selectedEdgeData.target}
                            </button>
                          </span>
                        </div>
                        <div className="font-medium text-xl">
                          Experiment:{" "}
                          <span
                            className="mr-1 inline-block w-3 h-3"
                            style={{
                              backgroundColor:
                                experimentColorMap[selectedEdgeData.experiment],
                            }}
                          ></span>
                          <span className="experiment">
                            {selectedEdgeData.experiment}
                          </span>
                        </div>
                        <div className="">
                          Min:{" "}
                          <span className="min">
                            {selectedEdgeData?.min_distance?.toFixed(4)}
                          </span>{" "}
                          - Max:{" "}
                          <span className="max">
                            {selectedEdgeData?.max_distance?.toFixed(4)}
                          </span>{" "}
                          - Median:{" "}
                          <span className="median">
                            {selectedEdgeData?.median_distance?.toFixed(4)}
                          </span>
                        </div>
                        <div className="">
                          Mean:{" "}
                          <span className="mean">
                            {selectedEdgeData?.mean_distance?.toFixed(4)}
                          </span>{" "}
                          - Scaled Mean:{" "}
                          <span className="mean">
                            {selectedEdgeData?.scaledDistance?.toFixed(2)}
                          </span>
                          %
                        </div>

                        <div className="">
                          <div className="overflow-x-auto h-48">
                            <table className="table table-xs">
                              <thead>
                                <tr>
                                  <th>Conditions</th>
                                  <td>Distance</td>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(
                                  selectedEdgeData.connections
                                ).map(([key, value]) => (
                                  <tr key={key}>
                                    <td>{key}</td>
                                    <td>{value?.toFixed(4)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex ">
              <div className="collapse collapse-arrow">
                <input type="checkbox" />
                <div className="collapse-title inline-flex items-center">
                  <FaFileDownload className={`text-2xl mr-1`} />
                  <div
                    className={`text-xl font-medium duration-300 ${
                      !open && "scale-0"
                    }`}
                  >
                    Download
                  </div>
                </div>
                <div
                  className={`collapse-content space-y-2 ${!open && "scale-0"}`}
                >
                  <div className="flex items-center">
                    <button
                      onClick={handleDownload}
                      className="btn btn-sm btn-success"
                    >
                      <LuFileJson />
                      Download Data
                    </button>
                  </div>
                  <div className="flex items-center">
                    <button
                      onClick={handleCytoscapeJsonDownload}
                      className="btn btn-sm btn-success"
                    >
                      <PiGraphFill />
                      Download Cytoscape Graph
                    </button>
                  </div>
                  <div className="flex items-center">
                    <button
                      onClick={handleCytoscapeImageDownload}
                      className="btn btn-sm btn-success"
                    >
                      <BsFiletypePng />
                      Download Cytoscape Image
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContextGraph;
