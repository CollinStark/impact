import FileUploadForm from "../../components/FileUploadForm";

export default function Targeted() {
  return (
    <div className="container mx-auto px-4 prose">
      <div className="space-y-4">
        <h1 className="">Targeted MID Calculation</h1>
        <p>
          Welcome to our Targeted Mass Isotopomer Distributions (MID)
          Calculation page, you can find the format specifications and
          documentation{" "}
          <a href="/docs#targeted-analysis" target="_blank" className="">
            here
          </a>{" "}
          and also{" "}
          <a href="/docs#impact-demo" target="_blank" className="">
            demo data
          </a>
          !
        </p>

        <p className="text-sm italic">
          <span className="font-bold">Note:</span> Please ensure that your
          CSV/TSV file complies with the specified format for a smooth and
          error-free experience.
        </p>
      </div>

      <FileUploadForm />
    </div>
  );
}
