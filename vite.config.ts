import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { writeFileSync } from 'node:fs';

/** Dev only: lets the ?debug=1 panel "Save" button write public/data/tuning.json. */
function tuningSaver(): Plugin {
  return {
    name: 'tuning-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save-tuning', (req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            writeFileSync('public/data/tuning.json', JSON.stringify(JSON.parse(body), null, 1) + '\n');
            res.end('ok');
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), tuningSaver()],
  // GitHub Pages serves from /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
