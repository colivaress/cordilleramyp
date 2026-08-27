import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  : "*.supabase.co";

const nextConfig: NextConfig = {
  // @react-pdf/renderer y nodemailer no deben pasar por el bundler del servidor.
  serverExternalPackages: ["@react-pdf/renderer", "nodemailer"],
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
