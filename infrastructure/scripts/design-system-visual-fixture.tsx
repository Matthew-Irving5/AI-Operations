import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { themeBootstrapScript } from '../../packages/ui/src/theme';
import { DesignSystemShowcase } from '../../apps/web/app/(app)/design-system/showcase';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = resolve(root, 'apps/web');

function inlineFontStylesheet(path: string) {
  const source = readFileSync(path, 'utf8');
  return source.replace(/url\((\.\/files\/[^)]+)\)/g, (_match, relativePath: string) => {
    const fontPath = resolve(dirname(path), relativePath);
    const mime = fontPath.endsWith('.woff2') ? 'font/woff2' : 'font/woff';
    return `url(data:${mime};base64,${readFileSync(fontPath).toString('base64')})`;
  });
}

const styles = [
  inlineFontStylesheet(resolve(webRoot, 'node_modules/@fontsource-variable/mona-sans/wght.css')),
  inlineFontStylesheet(resolve(webRoot, 'node_modules/@fontsource/ibm-plex-mono/400.css')),
  readFileSync(resolve(root, 'packages/ui/src/tokens.css'), 'utf8'),
  readFileSync(resolve(root, 'packages/ui/src/components.css'), 'utf8'),
  readFileSync(resolve(webRoot, 'app/(app)/design-system/showcase.css'), 'utf8'),
];

const html = `<!doctype html><html lang="en-GB" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script>${themeBootstrapScript}</script><style>${styles.join('\n')}</style></head><body><main>${renderToString(<DesignSystemShowcase />)}</main></body></html>`;
const port = Number(process.env.DESIGN_SYSTEM_VISUAL_PORT ?? '4311');
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
});
server.listen(port, '127.0.0.1');
