import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  esbuild: { keepNames: true },
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Local release and TeX trees can contain hundreds of thousands of files.
      ignored: ["**/.tools/**", "**/release/**", "**/src-tauri/target/**"],
    },
  },
  clearScreen: false,
  build: { chunkSizeWarningLimit: 1300 },
});
