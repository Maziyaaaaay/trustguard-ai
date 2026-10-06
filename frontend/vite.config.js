import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    host: "0.0.0.0",
    port: 5173,

    allowedHosts: [
      ".ngrok-free.dev",
      ".ngrok-free.app",
    ],

    hmr: false,

    proxy: {
      "/api": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },

      "/health": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
    },
  },
});