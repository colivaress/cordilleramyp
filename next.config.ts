import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  : "*.supabase.co";

const nextConfig: NextConfig = {
  // Requerido por el Dockerfile de producción (pipeline CI/CD): genera
  // .next/standalone con un server.js autocontenido, sin necesitar node_modules
  // completo en la imagen final.
  output: "standalone",
  // @react-pdf/renderer, nodemailer y sharp no deben pasar por el bundler del servidor.
  serverExternalPackages: ["@react-pdf/renderer", "nodemailer", "sharp"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;
