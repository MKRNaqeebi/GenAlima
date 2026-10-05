import { TanStackRouterVite } from "@tanstack/router-vite-plugin"
import react from "@vitejs/plugin-react-swc"
import { defineConfig, loadEnv } from "vite"

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")

  return {
    plugins: [react(), TanStackRouterVite()],
    server: {
      // Component icons are served by the API in development, under the same
      // prefix it mounts, so the dev server has to forward them.
      proxy: {
        "/media": {
          target: env.VITE_API_URL || "http://localhost:8000",
          changeOrigin: true,
        },
      },
    },
  }
})
