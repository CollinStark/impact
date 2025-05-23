interface paletteProps  {
    [key: number]: string[]
}

export const lightPalette : paletteProps = {
    1: ['#dbf9d2'],
    2: ['#b3cfae', '#c8b3d3'],
    3: ['#86d2ce', '#d2b1d5', '#d5c695'],
    4: ['#88d5c8', '#e8a9bb', '#d3c996', '#a5bcea'],
    5: ['#89d6c5', '#e1add3', '#cdce98', '#94c1e9', '#e7ad94'],
    6: ['#8ed8c3', '#eba5af', '#d2b2e1', '#cdce98', '#7fc5e6', '#e6b28f'],
    7: ['#8ed8c3', '#eda1bf', '#cdce98', '#ceb3e4', '#e8a9ab', '#7fc5e6', '#e6b28f'],
    8: ['#7cd6d1', '#eda0b9', '#a9d6a8', '#ceb3e4', '#d5ca95', '#e7af8f', '#87c3e9', '#e4afb5'],
    9: ['#a3d6ad', '#eda1bf', '#7cd6d1', '#ceb3e4', '#e5e2aa', '#c0bb84', '#87c3e9', '#e7af8f', '#e6abb1'],
    10: ['#90deca', '#eda1bf', '#9cc99a', '#d8b1e2', '#6ecedf', '#e7af8f', '#dfe5af', '#c9bb85', '#a0bee9', '#e6abb1'],
    11: ['#90deca', '#eda1bf', '#9cc99a', '#d8b1e2', '#e3c889', '#a0bee9', '#ddeab3', '#6ecedf', '#e6ad8e', '#e6abb1', '#c1bc8e'],
    12: ['#baecc9', '#eda1bf', '#96c596', '#77d4cf', '#cbb4e8', '#dac181', '#87c3e9', '#dfe3ad', '#e7af8f', '#ddb3d2', '#e6abb1', '#bbb98d'],
    13: ['#d0eebe', '#d6b0e8', '#a1c991', '#ccb473', '#eda1bf', '#8bd5bf', '#a0bee9', '#ebdba2', '#6fd0e0', '#e7af8f', '#bdbb8e', '#ddb3d2', '#e6abb1'],
    14: ['#d0eebe', '#d6b0e8', '#a1c991', '#ccb473', '#93b7e8', '#eda1bf', '#8bd5bf', '#ebdba2', '#6fd0e0', '#e7af8f', '#b1c8eb', '#bdbb8e', '#ddb3d2', '#e6abb1'],
    15: ['#d0eebe', '#d6b0e8', '#a1c991', '#ccb473', '#93b7e8', '#eda1bf', '#8bd5bf', '#ebdba2', '#6fd0e0', '#e8a39b', '#e7b48f', '#b1c8eb', '#bdbb8e', '#d6aac1', '#f2c3d6']
  };

export const colorBlindPalette: paletteProps = {
    1: ['#687129'],
    2: ['#a68f49', '#9b5b9d'],
    3: ['#bb773d', '#995a9f', '#6db267'],
    4: ['#b3903c', '#8d5dab', '#59b371', '#bc4a58'],
    5: ['#a3a242', '#bb4b75', '#855fb1', '#53b982', '#ba563d'],
    6: ['#75a74e', '#b94e86', '#7b61b5', '#c08e3b', '#49c59d', '#b94948'],
    7: ['#6fa651', '#bb4b75', '#823e90', '#bc943b', '#49c59d', '#847fd5', '#ba4d40'],
    8: ['#5da453', '#bb4d85', '#b5a342', '#603183', '#907fd4', '#b45936', '#49c59d', '#ba4758'],
    9: ['#6ba14d', '#4f2a7a', '#be9f40', '#bc4d7d', '#48c79b', '#b55936', '#697bd1', '#bb65b6', '#bd4656'],
    10: ['#6da450', '#4c2978', '#b55c37', '#c0a440', '#bc4d7d', '#49c59d', '#5d89d1', '#ba4758', '#bb62af', '#816ccf'],
    11: ['#66a450', '#7c234f', '#bb9c3f', '#ce588b', '#4c2978', '#b75337', '#726ccf', '#49c59d', '#ba4758', '#5c88d0', '#ba63b4'],
    12: ['#a49049', '#7c234f', '#5bad60', '#4c2978', '#b85237', '#44caaf', '#b7a13a', '#ce588b', '#5a87d0', '#ba4758', '#bb62af', '#836cd0'],
    13: ['#b3884a', '#7c234f', '#5e95da', '#b54934', '#ba4758', '#69a852', '#ce588b', '#4e2575', '#49c59d', '#bf9b37', '#6959a4', '#c064b5', '#7672d6'],
    14: ['#909849', '#7c234f', '#ce588b', '#5e95da', '#be7539', '#44caaf', '#ba4758', '#b3a93c', '#4e2575', '#6959a4', '#c064b5', '#7672d6', '#56af64', '#b64a37'],
    15: ['#a58b46', '#7c234f', '#a6b040', '#ce588b', '#6e69cc', '#65a853', '#b24634', '#3ed3c5', '#4bc08d', '#c87ed0', '#472979', '#ba4758', '#9d3989', '#5b85cc', '#cb8639']
  }

interface themeProps {
      "color-scheme": string;
      "primary": string;
      "primary-content": string;
      "secondary": string;
      "accent": string;
      "neutral": string;
      "base-100": string;
      "base-200": string;
      "base-300": string;
      [key: string]: string | undefined; 
 
}

  export const themePalette: themeProps =  {
      "color-scheme": "light",
      "primary": "#570df8",
      "primary-content": "#E0D2FE",
      "secondary": "#f000b8",
      "secondary-content": "#FFD1F4",
      "accent": "#1ECEBC",
      "accent-content": "#07312D",
      "neutral": "#2B3440",
      "neutral-content": "#D7DDE4",
      "base-100": "#ffffff",
      "base-200": "#F2F2F2",
      "base-300": "#E5E6E6",
      "base-content": "#1f2937",
   
  }
  