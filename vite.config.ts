import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run dev` (netlify dev) serves the functions itself. The proxy below is only for running
// `netlify functions:serve` and `vite` side by side.
const functions = "http://localhost:9999";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": functions, "/.netlify/functions": functions } },
});
