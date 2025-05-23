"use client";
import React from "react";
import CalculationUpload from "./upload/CalculationUpload";
import { useSearchParams } from "next/navigation";

const UntargetedCalculation = () => {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="container mx-auto px-4 prose">
      <h1>MID Calculation</h1>
      <p>
        Welcome to the MID (Mass Isotopomer Distribution) Calculation page. You
        can find the format specifications and parameter documentation{" "}
        <a href="/docs#mid-calculation" target="_blank" className="">
          here
        </a>{" "}
        and also{" "}
        <a href="/docs#impact-demo" target="_blank" className="">
          demo data
        </a>
        !
      </p>

      <CalculationUpload sessionId={sessionId} />
    </div>
  );
};

export default UntargetedCalculation;
