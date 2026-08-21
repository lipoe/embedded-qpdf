# @lipoe/browser-qpdf

Browser-compatible WASM module exposing qpdf's library API for reading and replacing PDF image streams.

## Features

- Load PDFs (with or without password) entirely in-browser via WebAssembly
- Enumerate image XObjects with full metadata (dimensions, color space, filter, stream length)
- Read decoded or raw image stream data
- Replace image streams with new content and metadata
- Write modified PDFs back to `Uint8Array`
- No filesystem dependencies — works in browsers and web workers

## Prerequisites

- [Docker](https://www.docker.com/) (for building the WASM module)
- [Node.js](https://nodejs.org/) >= 18
- npm

## Building

The WASM compilation runs inside a Docker container with Emscripten pre-configured. Two steps:

```bash
# 1. Clone the qpdf source (not included in the repo)
git clone https://github.com/qpdf/qpdf.git qpdf-src

# 2. Build the Docker image
docker build -t qpdf-wasm-builder .

# 3. Compile WASM (artifacts land in ./dist)
# PowerShell:
docker run --rm -v "${PWD}\dist:/out" qpdf-wasm-builder
# Bash:
docker run --rm -v "$(pwd)/dist:/out" qpdf-wasm-builder

# 4. Install dependencies
npm install

# 5. Build TypeScript wrapper
npm run build
```

After this you should have `dist/qpdf-image-stream.js`, `dist/qpdf-image-stream.wasm`, `dist/index.js`, and `dist/index.d.ts`.

## Usage

```typescript
import { createQpdfImageStreams } from '@lipoe/browser-qpdf';

const qpdf = await createQpdfImageStreams();

// Load a PDF
const pdfBytes = new Uint8Array(/* ... */);
const result = qpdf.loadPdf(pdfBytes);

if (result.ok) {
    const doc = result.value;

    // List all images
    const images = doc.getImages();
    if (images.ok) {
        for (const img of images.value) {
            console.log(`Image ${img.objId}: ${img.width}x${img.height}, ${img.filter}`);
        }
    }

    // Read decoded image stream data
    const streamData = doc.getImageStreamData(images.value[0].objId, images.value[0].generation);

    // Replace an image stream
    doc.replaceImageStream(objId, generation, newImageData, {
        width: 800,
        height: 600,
        colorSpace: 'DeviceRGB',
        filter: 'DCTDecode',
    });

    // Write modified PDF
    const output = doc.writePdf();
    if (output.ok) {
        // output.value is a Uint8Array with the new PDF
    }

    // Release WASM memory
    doc.close();
}
```

### Password-protected PDFs

```typescript
const result = qpdf.loadPdfWithPassword(pdfBytes, 'secret');
```

### Custom WASM location

```typescript
const qpdf = await createQpdfImageStreams({
    locateFile: (filename) => `/assets/wasm/${filename}`,
});
```

## Bundler Usage (Vite, Webpack, etc.)

When using this package with a bundler, the WASM file cannot be resolved automatically. You need to tell the library where to find it using `locateFile`.

### Vite

```typescript
// Import the WASM URL as a static asset
import wasmUrl from '@lipoe/browser-qpdf/qpdf-image-stream.wasm?url';
import { createQpdfImageStreams } from '@lipoe/browser-qpdf';

const qpdf = await createQpdfImageStreams({
    locateFile: (name) => name.endsWith('.wasm') ? wasmUrl : name,
});
```

In your `vite.config.ts`:

```typescript
export default defineConfig({
    assetsInclude: ['**/*.wasm'],
    optimizeDeps: {
        exclude: ['@lipoe/browser-qpdf'],
    },
});
```

### Webpack / other bundlers

Copy the `.wasm` file to your public/static directory and point `locateFile` to it:

```typescript
import { createQpdfImageStreams } from '@lipoe/browser-qpdf';

const qpdf = await createQpdfImageStreams({
    locateFile: (filename) => `/static/${filename}`,
});
```

### Why is `locateFile` needed?

Emscripten's generated glue code resolves the `.wasm` file relative to the JS module. After bundling, the JS is typically relocated/renamed while the `.wasm` stays behind, breaking the relative path. `locateFile` gives you explicit control over where the WASM is loaded from.

## Playground

A browser-based playground is included for quick testing:

```bash
npm run playground
```

This serves the project root with a static file server. Open the displayed URL and navigate to `playground/index.html`.

## Local development (npm link)

To use this package locally in another project:

```bash
# In this repo
npm link

# In your consumer project
npm link @lipoe/browser-qpdf
```

## Testing

```bash
npm test
```

## API

All operations return a `Result<T>` type instead of throwing exceptions:

```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

### `createQpdfImageStreams(options?): Promise<QpdfImageStreams>`

Factory function that loads and initializes the WASM module.

### `QpdfImageStreams.loadPdf(data): Result<PdfDocument>`

Load an unprotected PDF from a `Uint8Array`.

### `QpdfImageStreams.loadPdfWithPassword(data, password): Result<PdfDocument>`

Load a password-protected PDF.

### `PdfDocument.getImages(options?): Result<ImageInfo[]>`

Enumerate all image XObjects. Pass `{ recursive: true }` to include nested images.

### `PdfDocument.getImageStreamData(objId, generation): Result<Uint8Array>`

Read decoded (decompressed) image stream data.

### `PdfDocument.getRawImageStreamData(objId, generation): Result<Uint8Array>`

Read raw (compressed) image stream data.

### `PdfDocument.replaceImageStream(objId, generation, data, metadata?): Result<void>`

Replace image stream content. Omitted metadata fields preserve original values.

Metadata fields:
- `width` / `height` — new pixel dimensions
- `bitsPerComponent` — bits per color component (e.g. 8)
- `colorSpace` — PDF color space name without leading slash (e.g. `'DeviceRGB'`, `'DeviceGray'`)
- `filter` — PDF filter name without leading slash (e.g. `'DCTDecode'` for JPEG, `'FlateDecode'` for zlib)

Both `filter` and `colorSpace` accept values with or without a leading `/` — the library normalizes automatically.

### `PdfDocument.writePdf(): Result<Uint8Array>`

Serialize the (possibly modified) PDF to a new `Uint8Array`.

### `PdfDocument.close(): void`

Release all WASM memory. After this call, all other methods return an error. Multiple calls are no-ops.

## License

Apache 2.0. See [LICENSE](./LICENSE).

This package includes compiled code from:
- [qpdf](https://github.com/qpdf/qpdf) (Apache 2.0)
- [zlib](https://github.com/madler/zlib) (zlib License)
- [libjpeg-turbo](https://github.com/libjpeg-turbo/libjpeg-turbo) (BSD 3-Clause / IJG)

See [THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES) for full license texts.
