import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@engine": path.resolve(__dirname, "../../engine"),
    },
    dedupe: ["react", "react-dom", "three"],
  },
  server: {
    port: 3015,
    host: "127.0.0.1",
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
