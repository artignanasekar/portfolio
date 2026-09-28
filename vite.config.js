import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const pages = ['index', 'about', 'ibm', 'pearl', 'speakeasy', 'hero-test'];

// Vercel serves /about as about.html (cleanUrls in vercel.json). Mirror that
// locally so the extensionless nav links work in `vite` and `vite preview`.
function cleanUrls() {
  const rewrite = (req, _res, next) => {
    const [path, query] = req.url.split(/(?=\?)/);
    const page = path.replace(/^\//, '');
    if (pages.includes(page)) req.url = `/${page}.html${query ?? ''}`;
    next();
  };
  return {
    name: 'clean-urls',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

// Every page links shared.css before its own stylesheet, so page rules win
// ties in the cascade. Vite splits shared.css into its own chunk and injects
// it *after* the page CSS, so move it back in front to keep the source order.
function sharedCssFirst() {
  const sharedLink = /\s*<link rel="stylesheet"[^>]*href="\/assets\/shared-[\w-]+\.css"[^>]*>/;
  return {
    name: 'shared-css-first',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const link = html.match(sharedLink);
        if (!link) return html;
        const rest = html.replace(link[0], '');
        if (!rest.includes('<link rel="stylesheet"')) return html;
        return rest.replace(/<link rel="stylesheet"/, `${link[0].trim()}\n  <link rel="stylesheet"`);
      },
    },
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [cleanUrls(), sharedCssFirst()],
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        pages.map((page) => [page, resolve(import.meta.dirname, `${page}.html`)])
      ),
    },
  },
});
