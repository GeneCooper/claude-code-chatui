import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: resolve(__dirname, 'src/webview'),
  build: {
    outDir: resolve(__dirname, 'out/webview'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: 'assets/main.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
        manualChunks: {
          mermaid: ['mermaid'],
        },
      },
    },
    cssCodeSplit: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
