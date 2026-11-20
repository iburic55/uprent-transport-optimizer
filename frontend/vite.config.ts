import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// U razvoju Vite (5173) prosljeđuje /api na FastAPI (8000).
const backend = "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { "/api": backend, "/docs": backend, "/openapi.json": backend },
  },
});
