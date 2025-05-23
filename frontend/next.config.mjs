/** @type {import('next').NextConfig} */
import nextMdx from "@next/mdx";

import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

const nextConfig = {
  output: "standalone",
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
};

const withMDX = nextMdx({
  options: {
    rehypePlugins: [
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: "append", // Adds the link after the heading text
          properties: {
            className: ["subheading-anchor"], // Optional: for styling the link
          },
          content: {
            type: "text",
            value: " #",
          },
        },
      ],
    ],
  },
});
export default withMDX(nextConfig);
