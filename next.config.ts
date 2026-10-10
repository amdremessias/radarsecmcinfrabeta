import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "fontkit"],
  outputFileTracingRoot: __dirname,
};

export default nextConfig;