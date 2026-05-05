import { defineConfig } from 'vite';

export default defineConfig({
  // Carpeta de salida del build de producción
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Evita que Vite renombre archivos de salida (más simple para hosting estático)
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  // Servidor de desarrollo
  server: {
    port: 5173,
    open: true, // abre el navegador automáticamente
  },
});
