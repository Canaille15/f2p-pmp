import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // es2022 requis par pdfjs-dist@4.0.379 (top-level await dans son bundle) —
    // sans risque reel, les navigateurs cibles (mobile/desktop recents) le
    // supportent tous.
    target: 'es2022',
  },
  // Le pre-bundling du serveur de dev (esbuild) a sa propre target, separee
  // de build.target ci-dessus — meme raison (pdfjs-dist@4.0.379).
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
})
