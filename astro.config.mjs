import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  output: 'server',
  adapter: cloudflare(),

  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ['.app.github.dev']
    }
  },
});