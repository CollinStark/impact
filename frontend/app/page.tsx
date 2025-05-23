export default function Home() {
  return (
    <main className="">
      <div
        className="hero min-h-screen "
        style={{
          backgroundImage: "url(brics.jpg)",
        }}
      >
        <div className="hero-overlay bg-opacity-60"></div>
        <div className="hero-content text-center text-neutral-content">
          <div className="max-w-md">
            <h1 className="mb-5 text-5xl font-bold">IMPACT</h1>
            <h3 className="mb-5 text-3xl font-bold">
              Integrative Metabolomics Platform for Analysis, Contextualization
              and Targeting
            </h3>
          </div>
        </div>
      </div>
    </main>
  );
}
