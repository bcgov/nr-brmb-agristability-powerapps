import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  build: {
    // Force all app-switcher icon files to be inlined as base64 data URLs
    // regardless of size — npx power-apps push does not upload external asset
    // files (jpg/png) from dist/assets/, so they must live inside the JS bundle.
    assetsInlineLimit: (filePath: string) => {
      if (/\/public\/icons\/app-/.test(filePath)) return true;
      return undefined; // use Vite default (4 KB) for everything else
    },
  },
  server: {
    host: "::",
    port: 3000,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});