# vendor

Third-party libraries served locally instead of via CDN so the PWA
works fully offline.

| file                       | source                                                                   | license     |
|----------------------------|--------------------------------------------------------------------------|-------------|
| `jszip.min.js`             | https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js              | MIT / GPLv3 |
| `tesseract.min.js`         | https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js        | Apache 2.0  |
| `worker.min.js`            | https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js           | Apache 2.0  |
| `tesseract-core.wasm.js`   | https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js  | Apache 2.0  |
| `tesseract-core.wasm`      | https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm     | Apache 2.0  |
| `chi_sim.traineddata.gz`   | https://tessdata.projectnaptha.com/4.0.0/chi_sim.traineddata.gz          | Apache 2.0  |

Refresh with:

```
cd site/vendor
curl -fsSL -O https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
curl -fsSL -O https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js
curl -fsSL -O https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js
curl -fsSL -O https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js
curl -fsSL -O https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm
curl -fsSL -O https://tessdata.projectnaptha.com/4.0.0/chi_sim.traineddata.gz
```
