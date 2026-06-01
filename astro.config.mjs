import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://clubshed.pro',
  integrations: [mdx()],
  build: {
    inlineStylesheets: 'auto',
  },
});
