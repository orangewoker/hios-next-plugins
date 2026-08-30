import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'runtime/pdf.worker.min.mjs'],
  ['node_modules/@flyfish-dev/cad-viewer/dist/wasm/dwg-worker.js', 'runtime/wasm/dwg-worker.js'],
  ['node_modules/@flyfish-dev/cad-viewer/dist/wasm/libredwg-web.js', 'runtime/wasm/libredwg-web.js'],
  ['node_modules/@flyfish-dev/cad-viewer/dist/wasm/libredwg-web.wasm', 'runtime/wasm/libredwg-web.wasm'],
  ['node_modules/@flyfish-dev/cad-viewer/dist/wasm/dwfv-render.wasm', 'runtime/wasm/dwfv-render.wasm'],
  ['node_modules/@flyfish-dev/cad-viewer/LICENSE', 'THIRD_PARTY-CAD-VIEWER-LICENSE.txt'],
  ['node_modules/@flyfish-dev/cad-viewer/NOTICE', 'THIRD_PARTY-CAD-VIEWER-NOTICE.txt'],
  ['node_modules/pdfjs-dist/LICENSE', 'THIRD_PARTY-PDFJS-LICENSE.txt'],
  ['node_modules/@flyfish-dev/cad-viewer/LICENSE', 'LICENSE'],
];

for (const [source, destination] of copies) {
  const output = resolve(root, destination);
  await mkdir(dirname(output), { recursive: true });
  await copyFile(resolve(root, source), output);
}
