# Third-party notices

- [PDF.js 4.10.38](https://github.com/mozilla/pdf.js/tree/v4.10.38), Apache License 2.0. The complete license is included in `THIRD_PARTY-PDFJS-LICENSE.txt`.
- [@flyfish-dev/cad-viewer 0.8.0](https://github.com/flyfish-dev/cad-viewer/tree/v0.8.0), AGPL-3.0-only. Its complete license and upstream notice are included in `THIRD_PARTY-CAD-VIEWER-LICENSE.txt` and `THIRD_PARTY-CAD-VIEWER-NOTICE.txt`.
- [@mlightcad/libredwg-web 0.7.9](https://github.com/mlightcad/libredwg-web/tree/v0.7.9), GPL-3.0. The exact corresponding-source links and rebuild instructions for the distributed JavaScript/WebAssembly files are recorded in `THIRD_PARTY-LIBREDWG-SOURCE.md`.
- [GNU LibreDWG](https://www.gnu.org/software/libredwg/), GPL-3.0-or-later, is the parser compiled by libredwg-web.

The PDF and CAD parsers run locally inside the plugin renderer. Source files are not sent to a remote conversion service. The plugin repository ships the TypeScript source, locked dependency versions, build configuration, complete runtime files, licenses, notices, and corresponding-source references together.
