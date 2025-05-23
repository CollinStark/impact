"use client";

import React from "react";
import { useDropzone } from "react-dropzone";

interface StyledDropzoneProps {
  isFocused?: boolean;
  isDragAccept?: boolean;
  isDragReject?: boolean;
  onDrop: (acceptedFiles: File[]) => void; // Callback function for handling dropped files
}

const StyledDropzone: React.FC<StyledDropzoneProps> = ({ onDrop }) => {
  const { getRootProps, getInputProps, isFocused, isDragAccept, isDragReject } =
    useDropzone({ onDrop });

  let containerClasses =
    "container flex flex-col items-center p-5 border-4 rounded-lg border-dashed transition-all";
  if (isFocused) containerClasses += " border-primary shadow-primary-focus"; // Using DaisyUI primary color
  if (isDragAccept) containerClasses += " border-success shadow-success-focus"; // Using DaisyUI success color
  if (isDragReject) containerClasses += " border-error shadow-error-focus"; // Using DaisyUI error color

  return (
    <div {...getRootProps({ className: containerClasses })}>
      <input {...getInputProps({ className: containerClasses })} />
      <p>Drag &apos;n&apos; drop some files here, or click to select files</p>
    </div>
  );
};

export default StyledDropzone;
