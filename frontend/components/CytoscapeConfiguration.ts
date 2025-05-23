import {
  Stylesheet,
} from "cytoscape";

const baseStylesheet: Stylesheet[] = [
  {
    selector: "node",
    style: {
      label: "data(name)",
      "background-color": "#eee",
    },
  },
  {
    selector: ".hidden",
    style: {
      display: "none",
    },
  },
  {
    selector: ".hiddenTargeted",
    style: {
      display: "none",
    },
  },
  {
    selector: "node.highlighted",
    style: {
      "min-zoomed-font-size": 0,
      "z-index": 9999
    },
  },
  {
    selector: "edge.highlighted",
    style: {
      "opacity": 0.8,
      "width": 4,
      "z-index": 9999
    },
  },
  {
    selector: ".faded",
    style: {
      "events": "no",
    },
  },
  {
    selector: "node.faded",
    style: {
      "opacity": 0.08,
    },
  },
  {
    selector: "edge.faded",
    style: {
      "opacity": 0.06,
    },
  },
  {
    selector: 'node.unhovered',
    style: {
      'opacity': 0.2
    }
  },

  {
    selector: 'edge.unhovered',
    style: {
      'opacity': 0.05
    }
  },

  {
    selector: '.hovered',
    style: {
      'z-index': 999999
    }
  },

  {
    selector: 'node.hovered',
    style: {
      'border-width': 6,
      'border-color': '#AAD8FF',
      'border-opacity': 0.5,
      'background-color': '#394855',
      'text-outline-color': '#394855',
    }
  },
  
];


export const configTargeted = {
  style: [...baseStylesheet],
  layout: { name: 'preset' },
  
};

export const configUnknown = {
  style: [...baseStylesheet],
  layout: { name: 'fcose', nodeRepulsion: 4500, idealEdgeLength: 800,
  edgeElasticity: 1,  nestingFactor: 0.6,  },
};

export const configExperiment = {
  style: [...baseStylesheet],
  layout: { name: 'grid'},
};

