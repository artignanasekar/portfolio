import { readFileSync } from 'node:fs';
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

// The site footer is one component: its markup lives in
// partials/site-footer.html and is inlined wherever a page has a
// <!-- site-footer --> placeholder, in dev and in the build.
const FOOTER_PARTIAL = resolve(import.meta.dirname, 'partials/site-footer.html');

function siteFooter() {
  return {
    name: 'site-footer',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!html.includes('<!-- site-footer -->')) return html;
        const footer = readFileSync(FOOTER_PARTIAL, 'utf8').trim();
        return html.replace(/([ \t]*)<!-- site-footer -->/g, (_, indent) =>
          footer.split('\n').map((line) => indent + line).join('\n'));
      },
    },
    configureServer(server) {
      server.watcher.add(FOOTER_PARTIAL);
      server.watcher.on('change', (file) => {
        if (file === FOOTER_PARTIAL) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [cleanUrls(), siteFooter(), sharedCssFirst()],
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        pages.map((page) => [page, resolve(import.meta.dirname, `${page}.html`)])
      ),
    },
  },
});
