import React, { Dispatch, SetStateAction } from "react";

import { SlTarget } from "react-icons/sl";
import { BsQuestionLg } from "react-icons/bs";
import { GiSoapExperiment } from "react-icons/gi";

interface ModeSwitcherProps {
  activeMode: string;
  setActiveMode: Dispatch<SetStateAction<string>>;
}

const ModeSwitcher: React.FC<ModeSwitcherProps> = ({
  activeMode,
  setActiveMode,
}) => {
  const modes = [
    {
      id: "unknown",
      name: "Unknown Mode",
      icon: <BsQuestionLg />,
      color: "warning",
    },
    {
      id: "target",
      name: "Target Mode",
      icon: <SlTarget />,
      color: "success",
    },
  ];

  interface Mode {
    id: string;
    name: string;
    icon: JSX.Element;
    color: string;
  }

  const getButtonClass = (mode: Mode) => {
    if (activeMode === mode.id) {
      switch (mode.color) {
        case "warning":
          return "text-warning border-warning";
        case "success":
          return "text-success border-success";

        default:
          return "";
      }
    } else {
      return "text-base-200 border-neutral";
    }
  };

  const iconSize = "24px";
  return (
    <div className="flex w-full bg-neutral">
      {modes.map((mode) => (
        <div key={mode.id} className="tooltip" data-tip={mode.name}>
          <button
            key={mode.id}
            className={`ml-2 text-center p-2 border-t-4 ${getButtonClass(
              mode
            )}`}
            onClick={() => setActiveMode(mode.id)}
          >
            {/* Apply the size prop to the icon */}
            {React.cloneElement(mode.icon, {
              size: iconSize,
            })}
          </button>
        </div>
      ))}
    </div>
  );
};

export default ModeSwitcher;
