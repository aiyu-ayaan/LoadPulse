import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const frontendPort = Number(env.FRONTEND_PORT || 5173)
  const backendPort = Number(env.BACKEND_PORT || env.PORT || 4000)
  const proxyTarget = env.VITE_API_PROXY_TARGET?.trim() || `http://localhost:${backendPort}`

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      host: env.FRONTEND_HOST?.trim() || '0.0.0.0',
      port: frontendPort,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/socket.io": {
          target: proxyTarget,
          ws: true,
        },
      },
    },
  }
})
