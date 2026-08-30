# LibreDWG WebAssembly corresponding source

This plugin distributes the following files copied without modification from `@flyfish-dev/cad-viewer@0.8.0`:

- `runtime/wasm/dwg-worker.js`
- `runtime/wasm/libredwg-web.js`
- `runtime/wasm/libredwg-web.wasm`

The corresponding source for `@mlightcad/libredwg-web@0.7.9` is available at:

- https://github.com/mlightcad/libredwg-web/tree/v0.7.9
- Git commit `b70b5573a6bf2345e5fb10f2adff7fb74a8123c5`

The upstream GNU LibreDWG project and its source are available at:

- https://www.gnu.org/software/libredwg/
- https://git.savannah.gnu.org/cgit/libredwg.git

The CAD viewer integration source used by this plugin is available at:

- https://github.com/flyfish-dev/cad-viewer/tree/v0.8.0
- Git commit `2f2861e7831ef42667d6928284f5227cd62ba010`

To reproduce this plugin runtime, use Node.js 22.13 or newer and run:

```bash
npm ci
npm run typecheck
npm run build
```

`package-lock.json` fixes the exact dependency graph. The build copies the worker and WebAssembly artifacts from the locked CAD viewer package into `runtime/wasm/`.
