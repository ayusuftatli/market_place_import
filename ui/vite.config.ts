import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "ui",
  base: "/ui/",
  plugins: [react()],
  build: {
    outDir: "../dist/ui",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/health": "http://localhost:3000",
      "/data": "http://localhost:3000",
      "/imports": "http://localhost:3000",
      "/orders": "http://localhost:3000",
      "/templates": "http://localhost:3000",
    },
  },
});
