# Implementation Plan: qpdf-wasm-image-streams

## Overview

This plan implements a browser-compatible WASM module that exposes qpdf's library API for reading and replacing PDF image streams. The implementation follows a bottom-up approach: build pipeline first, then C++ Embind wrapper (rewritten for typed_memory_view/val), TypeScript wrapper with Result types, tests, and finally the development playground.

## Tasks

- [x] 1. Set up Build Pipeline (Dockerfile + build script adaptation)
  - [x] 1.1 Create the Dockerfile using `emscripten/emsdk:3.1.74` base image
    - Install build tools (cmake, make, patch)
    - Copy source tree into container
    - Set the entry point to run `build-wasm.sh`
    - Copy output artifacts to `/out` volume mount
    - _Requirements: 1.1, 1.6, 1.7, 1.8, 1.9_

  - [x] 1.2 Update `build-wasm.sh` for ES6 module output and design-specified flags
    - Add `EXPORT_ES6=1` flag to emcc link step
    - Remove `EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]'` (replace with `'[]'`)
    - Add `-s WASM_BIGINT=1` (already present, verify)
    - Ensure `NO_FILESYSTEM=1`, `ALLOW_MEMORY_GROWTH=1`, `NO_DISABLE_EXCEPTION_CATCHING=1`
    - Output to `dist/qpdf-image-stream.js` and `dist/qpdf-image-stream.wasm`
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [x] 1.3 Add `deps/` directory with pinned zlib v1.3.1 and libjpeg-turbo 3.0.4 as git submodules or source archives
    - Configure `deps/zlib` at tag `v1.3.1`
    - Configure `deps/jpeg-turbo` at tag `3.0.4`
    - Verify `patches/jpeg-turbo-emscripten.patch` applies cleanly
    - _Requirements: 1.2, 1.6_

- [x] 2. Checkpoint - Verify build pipeline
  - Ensure Docker build completes successfully and produces `dist/qpdf-image-stream.js` + `dist/qpdf-image-stream.wasm`, ask the user if questions arise.

- [x] 3. Rewrite C++ Embind Wrapper for binary-safe data transfer
  - [x] 3.1 Rewrite `src/wrapper.cpp` class to use `emscripten::val` for input and `typed_memory_view` for output
    - Replace `std::string` parameters with `emscripten::val` (Uint8Array from JS)
    - Add `outputBuffer_: std::vector<uint8_t>` member for keeping typed_memory_view valid
    - Add `closed_` flag and lifecycle check in every method
    - Implement `loadPdf(val uint8Array)` using the val→heap copy pattern from design
    - Implement `loadPdfWithPassword(val uint8Array, std::string password)` similarly
    - _Requirements: 2.1, 2.2, 2.5, 10.1, 10.3_

  - [x] 3.2 Implement `getImages(bool recursive)` returning `val` (JS array of ImageInfo objects)
    - Use `QPDFPageDocumentHelper::forEachImage` with deduplication set
    - Return null for missing optional metadata fields (bitsPerComponent, colorSpace, filter)
    - Respect recursive option for Form XObject traversal (max depth 20)
    - Return results as `emscripten::val` array of objects
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.3 Implement `getImageStreamData` and `getRawImageStreamData` using `typed_memory_view`
    - Copy decoded/raw stream data into `outputBuffer_`
    - Return `val(typed_memory_view(outputBuffer_.size(), outputBuffer_.data()))`
    - Return error result for non-existent objects or decode failures
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 10.1_

  - [x] 3.4 Implement `replaceImageStream` accepting `val` (Uint8Array) and metadata object
    - Accept metadata as `val` object with width, height, bitsPerComponent, colorSpace, filter fields
    - Validate object is a stream, return error if not
    - Preserve existing metadata for omitted fields (0 for ints, empty for strings)
    - Update /Width, /Height, /BitsPerComponent, /ColorSpace, /Filter, /Length
    - _Requirements: 5.1, 5.2, 5.4, 5.6, 10.3_

  - [x] 3.5 Implement `writePdf()` returning `typed_memory_view` and `close()` for memory management
    - Write PDF to memory via `QPDFWriter::setOutputMemory()`
    - Copy result into `outputBuffer_` and return typed_memory_view
    - Implement `close()` that deletes QPDF instance and sets `closed_` flag
    - _Requirements: 6.1, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4_

  - [x] 3.6 Update Embind bindings to expose the new `val`-based interface
    - Remove old `value_object<ImageInfo>` and `register_vector` bindings
    - Bind new class methods that accept/return `val`
    - Ensure error results are structured `{success, error}` objects via `val`
    - _Requirements: 9.1, 9.2_

- [x] 4. Checkpoint - Verify C++ wrapper compiles
  - Ensure the updated `src/wrapper.cpp` compiles successfully via the Docker build pipeline, ask the user if questions arise.

- [x] 5. Create TypeScript Wrapper with Result types and async factory
  - [x] 5.1 Set up project tooling: `package.json`, `tsconfig.json`, build scripts
    - Create `package.json` with `"type": "module"`, exports map, files field, engines `>=18`
    - Create `tsconfig.json` targeting ES2022 with module NodeNext
    - Add dev dependencies: `typescript`, `vitest`, `fast-check`, `playwright`
    - Configure npm scripts: `build`, `test`, `test:pbt`
    - _Requirements: 8.4, 12.1, 12.2, 12.3, 12.4_

  - [x] 5.2 Implement `src/index.ts` with `createQpdfImageStreams` async factory function
    - Import and call the WASM module loader (`createQpdfModule`)
    - Accept `CreateOptions` with optional `locateFile` callback
    - Return a `QpdfImageStreams` API object on successful init
    - Reject with descriptive error if WASM loading fails
    - _Requirements: 8.1, 8.2, 9.3_

  - [x] 5.3 Implement `loadPdf` and `loadPdfWithPassword` methods on the API object
    - Validate input is Uint8Array
    - Check size limit (256 MB)
    - Check lifecycle (closed flag)
    - Pass Uint8Array to WASM via val
    - Return `Result<PdfDocument>` with document handle or error
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 5.4 Implement `PdfDocument` interface methods: `getImages`, `getImageStreamData`, `getRawImageStreamData`
    - `getImages(options?)`: call WASM, map null fields, return `Result<ImageInfo[]>`
    - `getImageStreamData(objId, gen)`: call WASM, copy typed_memory_view into new Uint8Array, return `Result<Uint8Array>`
    - `getRawImageStreamData(objId, gen)`: same pattern for raw data
    - Validate objId/generation are non-negative integers
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 10.2_

  - [x] 5.5 Implement `replaceImageStream` and `writePdf` methods on `PdfDocument`
    - `replaceImageStream`: validate metadata (negative checks), pass Uint8Array to WASM, return `Result<void>`
    - `writePdf`: call WASM, copy typed_memory_view into new Uint8Array, return `Result<Uint8Array>`
    - Check lifecycle and no-document states
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.4, 6.5, 6.6, 10.2, 10.4, 10.5_

  - [x] 5.6 Implement `close()` method and lifecycle guards
    - Call WASM `close()` to free QPDF instance
    - Set internal `closed` flag
    - All subsequent method calls return error Result
    - Multiple `close()` calls are no-ops
    - Add JSDoc comments documenting memory ownership model
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 5.7 Create `src/types.ts` with all public type exports and generate `.d.ts` declarations
    - Export `Result<T>`, `ImageInfo`, `ImageMetadata`, `PdfDocument`, `QpdfImageStreams`, `CreateOptions`
    - Configure tsconfig to emit declarations to `dist/`
    - Ensure all public interfaces have JSDoc
    - _Requirements: 8.3, 8.5, 12.1_

- [x] 6. Checkpoint - Verify TypeScript wrapper builds and type-checks
  - Ensure `tsc` compiles without errors, ask the user if questions arise.

- [x] 7. Write unit tests with vitest
  - [x] 7.1 Create test fixtures: PDF files with known image properties
    - Generate or source: `simple-one-image.pdf`, `multi-image.pdf`, `jpeg-compressed.pdf`, `nested-forms.pdf`, `no-images.pdf`
    - Place in `test/fixtures/` directory
    - Document expected properties (image count, dimensions, color spaces) in a fixture manifest
    - _Requirements: 2.1, 3.1, 4.1_

  - [x] 7.2 Write unit tests for PDF loading (valid, corrupt, password-protected)
    - Test: valid PDF returns `{ ok: true }` with document handle
    - Test: corrupt data returns `{ ok: false }` with error message
    - Test: password-protected PDF with correct password succeeds
    - Test: password-protected PDF with wrong password returns error
    - Test: oversized input (>256 MB mock) returns size error
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

  - [x] 7.3 Write unit tests for image enumeration and stream reading
    - Test: enumerate images returns correct count and metadata
    - Test: recursive option finds images in Form XObjects
    - Test: missing optional fields return null
    - Test: decoded stream data has expected byte length
    - Test: raw stream data matches encoded length
    - Test: non-existent object ID returns error
    - Test: empty PDF returns empty image list
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 4.1, 4.2, 4.3_

  - [x] 7.4 Write unit tests for stream replacement, PDF writing, and lifecycle
    - Test: replace stream updates metadata correctly
    - Test: omitted metadata fields are preserved
    - Test: negative metadata values return error without modifying stream
    - Test: write after replacement produces valid PDF
    - Test: write without modifications round-trips correctly
    - Test: close() then method call returns disposed error
    - Test: double close() is a no-op
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.5, 7.1, 7.2, 7.3, 7.4_

- [x] 8. Write property-based tests with fast-check
  - [x] 8.1 Write property test for PDF load/write round trip
    - **Property 1: PDF Load/Write Round Trip**
    - Load valid PDFs from fixture corpus, write back, reload, verify image enumeration matches
    - **Validates: Requirements 6.2, 6.3**

  - [x] 8.2 Write property test for image stream read round trip
    - **Property 2: Image Stream Read Round Trip**
    - For each image in test PDFs, read decoded data, replace with same data + original metadata, write, reload, verify decoded data matches
    - **Validates: Requirements 4.1, 5.1, 6.1**

  - [x] 8.3 Write property test for stream replacement metadata update
    - **Property 3: Stream Replacement Updates Metadata Correctly**
    - Generate random valid metadata (positive width/height/bpc, non-empty colorSpace), replace stream, verify metadata in enumeration
    - **Validates: Requirements 5.1, 3.2**

  - [x] 8.4 Write property test for omitted metadata preservation
    - **Property 4: Omitted Metadata Fields Are Preserved**
    - Replace stream with zeroed/empty metadata fields, verify original values preserved except /Length
    - **Validates: Requirements 5.2**

  - [x] 8.5 Write property test for invalid input rejection
    - **Property 5: Invalid Input Rejection**
    - Generate random byte arrays (not valid PDFs), verify loadPdf returns `{ ok: false }`
    - **Validates: Requirements 2.3**

  - [x] 8.6 Write property test for disposed instance rejection
    - **Property 6: Disposed Instance Rejection**
    - After close(), generate random method calls, verify all return disposed error
    - **Validates: Requirements 7.3**

  - [x] 8.7 Write property test for image deduplication
    - **Property 7: Image Deduplication**
    - Use PDFs with shared image references, verify each objId+generation appears exactly once
    - **Validates: Requirements 3.6**

  - [x] 8.8 Write property test for invalid metadata rejection
    - **Property 8: Invalid Metadata Rejection**
    - Generate negative width/height/bpc values, verify replaceImageStream returns error without modification
    - **Validates: Requirements 5.3**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Create Development Playground
  - [x] 10.1 Create `playground/index.html` with file picker, image list display, and download button
    - Load WASM module from `../dist/`
    - Implement drag-and-drop and file picker for PDF input
    - Display image list as HTML table (objId, dimensions, colorSpace, filter, streamLength)
    - Add buttons: read stream data size, replace with dummy data, download modified PDF
    - Display errors in a visible error area
    - Servable via static HTTP server without bundler
    - _Requirements: 11.1, 11.3, 11.4_

  - [x] 10.2 Exclude playground from npm package distribution
    - Add `playground/` to the exclusion list in `package.json` `files` field (it's already excluded by only listing `dist/` contents)
    - Verify playground is not in the published package
    - _Requirements: 11.2, 12.2_

- [x] 11. Final checkpoint - Ensure all tests pass and build pipeline produces valid output
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The existing `src/wrapper.cpp` PoC will be completely rewritten in task 3.1 (the interface changes from std::string to emscripten::val are too extensive for incremental edits)
- The existing `build-wasm.sh` will be modified in-place in task 1.2
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- `deps/zlib` and `deps/jpeg-turbo` may be added as git submodules or extracted archives depending on preference

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "3.4", "3.5"] },
    { "id": 3, "tasks": ["3.6", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.7"] },
    { "id": 5, "tasks": ["5.3", "5.4", "5.5", "5.6"] },
    { "id": 6, "tasks": ["7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 8, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8"] },
    { "id": 9, "tasks": ["10.1", "10.2"] }
  ]
}
```
