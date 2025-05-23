"use client";

import Content from "./content.mdx";

const Documentation = () => {
  return (
    <div className="container mx-auto px-4 prose mb-10">
      <div className="space-y-4">
        <Content />
      </div>
    </div>
  );
};

export default Documentation;
