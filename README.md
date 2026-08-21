# @lipoe/embedded-qpdf

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
import { createQpdfImageStreams } from '@lipoe/embedded-qpdf';

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
npm link @lipoe/embedded-qpdf
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

### `PdfDocument.writePdf(): Result<Uint8Array>`

Serialize the (possibly modified) PDF to a new `Uint8Array`.

### `PdfDocument.close(): void`

Release all WASM memory. After this call, all other methods return an error. Multiple calls are no-ops.

## License

See repository for license information.
