# Requirements Document

## Introduction

This feature implements a browser-compatible WASM module that exposes qpdf's library API for reading and replacing PDF image streams. The system uses an Embind C++ wrapper over qpdf's public API, a TypeScript async wrapper for ergonomic usage, and a Docker-based build pipeline adapted from the existing neslinesli93/qpdf-wasm project. A development-only browser playground provides end-to-end manual testing but is excluded from the published package.

## Glossary

- **WASM_Module**: The compiled WebAssembly binary (`.wasm`) and its JavaScript glue code (`.js`) produced by Emscripten, which together expose the qpdf library API to JavaScript
- **Embind_Wrapper**: The C++ source file (~270 LOC) that uses Emscripten's Embind mechanism to expose qpdf C++ API methods to JavaScript
- **TypeScript_Wrapper**: An async TypeScript module that wraps the raw Embind API, handles WASM module initialization, converts between Uint8Array and WASM memory, and provides an ergonomic public API
- **Build_Pipeline**: The Docker-based build environment and shell scripts that compile qpdf and its dependencies (zlib, libjpeg-turbo) to WebAssembly and link them with the Embind wrapper
- **Image_XObject**: A PDF stream object with `/Subtype /Image` that contains raster image data within a PDF document
- **Stream_Data**: The binary content of a PDF stream object, which can be raw (compressed/encoded) or decoded (uncompressed pixel data)
- **Playground**: A development-only browser HTML page for manual end-to-end testing of the WASM module, excluded from the published npm package

## Requirements

### Requirement 1: Build Pipeline

**User Story:** As a developer, I want a reproducible Docker-based build pipeline, so that I can compile the WASM module from source on any machine without manual environment setup.

#### Acceptance Criteria

1. WHEN the build script is executed inside the Docker container, THE Build_Pipeline SHALL produce a WASM_Module consisting of one `.wasm` file and one `.js` ES module glue file in the `dist/` directory within 600 seconds
2. THE Build_Pipeline SHALL compile zlib, libjpeg-turbo (with the `__EMSCRIPTEN__` BIT_BUF_SIZE patch), and qpdf as static libraries for the wasm32 target
3. THE Build_Pipeline SHALL link the Embind_Wrapper with the static libraries using `emcc --bind` and produce a modularized ES module (`MODULARIZE=1`, `EXPORT_ES6=1`)
4. THE Build_Pipeline SHALL build without requiring a virtual filesystem (`NO_FILESYSTEM=1`)
5. THE Build_Pipeline SHALL enable memory growth (`ALLOW_MEMORY_GROWTH=1`) and C++ exception support (`NO_DISABLE_EXCEPTION_CATCHING=1`)
6. THE Build_Pipeline SHALL use pinned versions for all dependencies: Emscripten SDK, zlib, libjpeg-turbo, and qpdf, where each version is specified as an exact tag, commit hash, or release number in the build configuration
7. IF a dependency fails to compile, THEN THE Build_Pipeline SHALL exit with a non-zero exit code and print the compiler error output to stderr
8. THE Build_Pipeline SHALL provide a single documented entry-point command that a developer executes to trigger the full build from a clean checkout without additional manual steps
9. IF the Docker image fails to build due to a missing or unreachable dependency, THEN THE Build_Pipeline SHALL exit with a non-zero exit code and output a message to stderr indicating which dependency could not be retrieved

### Requirement 2: PDF Loading

**User Story:** As a frontend developer, I want to load a PDF from a Uint8Array into the WASM module, so that I can analyze and manipulate the PDF in the browser without filesystem access.

#### Acceptance Criteria

1. WHEN a valid PDF is provided as a Uint8Array, THE TypeScript_Wrapper SHALL load the PDF into the WASM_Module and return a typed success result that contains a document handle usable for subsequent operations on the loaded PDF
2. WHEN a password-protected PDF is provided with the correct password as a string parameter, THE TypeScript_Wrapper SHALL decrypt and load the PDF and return the same typed success result as for unprotected PDFs
3. IF an invalid or corrupt PDF is provided, THEN THE TypeScript_Wrapper SHALL return a typed error result distinguishable from the success result, containing a message string sourced from qpdf describing the failure reason
4. IF a password-protected PDF is provided without a password or with an incorrect password, THEN THE TypeScript_Wrapper SHALL return a typed error result distinguishable from the success result, containing a message string indicating that password authentication failed
5. THE TypeScript_Wrapper SHALL accept PDF data exclusively as Uint8Array and transfer it to WASM memory without intermediate string encoding
6. IF the provided Uint8Array exceeds 256 MB in size or WASM memory allocation fails during loading, THEN THE TypeScript_Wrapper SHALL return a typed error result containing a message string indicating the memory or size constraint that was violated

### Requirement 3: Image Enumeration

**User Story:** As a frontend developer, I want to enumerate all image XObjects in a loaded PDF with their metadata, so that I can identify which images to process.

#### Acceptance Criteria

1. WHEN a PDF is loaded, THE TypeScript_Wrapper SHALL return a list of all Image_XObject entries found across all pages, ordered by first occurrence (page index ascending, then resource order within the page)
2. THE TypeScript_Wrapper SHALL include for each Image_XObject: object ID, generation number, width (pixels), height (pixels), bits per component, color space name, filter name, and encoded stream length in bytes
3. IF an Image_XObject lacks an optional metadata field (bits per component, color space name, or filter name), THEN THE TypeScript_Wrapper SHALL return a null value for that field
4. WHEN the recursive option is enabled, THE TypeScript_Wrapper SHALL also enumerate images embedded inside Form XObjects, traversing nested Form XObjects up to a maximum depth of 20 levels
5. IF the recursive option is enabled and nesting exceeds 20 levels, THEN THE TypeScript_Wrapper SHALL stop traversal at that depth and include the images found up to that point without raising an error
6. THE TypeScript_Wrapper SHALL deduplicate images that appear on multiple pages or within multiple Form XObjects, reporting each unique Image_XObject only once (identified by object ID and generation number)
7. IF the loaded PDF contains no Image_XObjects, THEN THE TypeScript_Wrapper SHALL return an empty list

### Requirement 4: Image Stream Reading

**User Story:** As a frontend developer, I want to read the raw or decoded binary data of an image stream, so that I can inspect image contents or pass them to a recompression pipeline.

#### Acceptance Criteria

1. WHEN decoded stream data is requested for a valid Image_XObject (identified by object ID and generation number matching an entry from image enumeration), THE TypeScript_Wrapper SHALL return the fully decompressed pixel data as a Uint8Array
2. WHEN raw stream data is requested for a valid Image_XObject, THE TypeScript_Wrapper SHALL return the original encoded/compressed bytes as a Uint8Array without applying any decoding
3. IF an object ID or generation number is provided that does not correspond to an existing stream object in the loaded PDF, THEN THE TypeScript_Wrapper SHALL return a structured error containing a message indicating the object was not found
4. IF decoding fails because the stream uses an unsupported filter, THEN THE TypeScript_Wrapper SHALL return a structured error indicating which filter could not be decoded
5. THE TypeScript_Wrapper SHALL transfer binary stream data from WASM memory to JavaScript by copying the typed memory view into a new Uint8Array, ensuring the returned data remains valid after subsequent WASM calls

### Requirement 5: Image Stream Replacement

**User Story:** As a frontend developer, I want to replace an existing image stream with new image data and updated metadata, so that I can substitute optimized or modified images in the PDF.

#### Acceptance Criteria

1. WHEN new image data is provided as a Uint8Array with updated metadata (width, height, bits per component, color space, filter), THE TypeScript_Wrapper SHALL replace the stream content of the target Image_XObject and update the dictionary entries /Width, /Height, /BitsPerComponent, /ColorSpace, /Filter, and /Length to match the provided values, where /Length SHALL equal the byte length of the provided Uint8Array
2. WHEN metadata fields are omitted (zero for integers, empty string for strings), THE TypeScript_Wrapper SHALL preserve the existing values from the original Image_XObject dictionary for those specific fields and still update /Length to match the new stream data byte length
3. IF the provided width or height is negative, or bits per component is negative, THEN THE TypeScript_Wrapper SHALL return a structured error indicating the invalid metadata value without modifying the existing stream
4. IF the target object is not a stream, THEN THE TypeScript_Wrapper SHALL return a structured error indicating that the target object is not a stream type
5. IF no PDF is currently loaded, THEN THE TypeScript_Wrapper SHALL return a structured error indicating no document is available
6. THE TypeScript_Wrapper SHALL accept the replacement data exclusively as Uint8Array and transfer it to WASM memory without intermediate string encoding

### Requirement 6: PDF Writing

**User Story:** As a frontend developer, I want to write the modified PDF back to a Uint8Array, so that I can download it or send it to a server.

#### Acceptance Criteria

1. WHEN the write operation is invoked after modifications, THE TypeScript_Wrapper SHALL produce a PDF as a Uint8Array that can be successfully reloaded by the same TypeScript_Wrapper without error
2. WHEN the write operation is invoked without any prior modifications, THE TypeScript_Wrapper SHALL produce a PDF as a Uint8Array that, when reloaded, yields the same image enumeration results (count, object IDs, dimensions, color spaces) as the originally loaded PDF
3. THE TypeScript_Wrapper SHALL preserve all non-modified PDF content in the output such that reloading the written PDF and enumerating images returns identical metadata (object IDs, dimensions, bits per component, color space, filter) for objects that were not replaced
4. THE TypeScript_Wrapper SHALL transfer the output PDF from WASM memory to JavaScript as a Uint8Array using typed memory views
5. IF no PDF is currently loaded, THEN THE TypeScript_Wrapper SHALL return a structured error indicating no document is available
6. IF the write operation fails due to an internal serialization error, THEN THE TypeScript_Wrapper SHALL return a structured error containing the failure reason from qpdf without leaving the loaded PDF in a corrupted state

### Requirement 7: Memory Management

**User Story:** As a frontend developer, I want explicit control over WASM memory lifecycle, so that I can avoid memory leaks when processing multiple PDFs in a long-running application.

#### Acceptance Criteria

1. THE TypeScript_Wrapper SHALL expose a `close()` method that releases all WASM memory held by the underlying qpdf instance
2. WHEN `close()` is called, THE TypeScript_Wrapper SHALL free the internal QPDF object and associated buffers
3. IF any method other than `close()` is called after `close()` has been invoked, THEN THE TypeScript_Wrapper SHALL return a structured error with a message indicating the instance has been disposed
4. WHEN `close()` is called multiple times, THE TypeScript_Wrapper SHALL treat subsequent calls as no-ops without raising an error
5. THE TypeScript_Wrapper SHALL document the memory ownership model in JSDoc comments on the factory function and `close()` method so callers know when to call `close()`

### Requirement 8: TypeScript API Design

**User Story:** As a frontend developer, I want a well-typed async API that handles WASM initialization transparently, so that I can use the module without understanding Emscripten internals.

#### Acceptance Criteria

1. THE TypeScript_Wrapper SHALL export an async factory function that loads and initializes the WASM_Module, returning a ready-to-use API object
2. THE TypeScript_Wrapper SHALL allow callers to customize the WASM file location via a `locateFile` option for CDN or bundler compatibility
3. THE TypeScript_Wrapper SHALL export full TypeScript type declarations (`.d.ts`) for all public interfaces, functions, and options
4. THE TypeScript_Wrapper SHALL be packaged as an ES module compatible with modern browsers and Node.js (ESM)
5. THE TypeScript_Wrapper SHALL be usable inside a Web Worker without modification (no DOM dependencies)

### Requirement 9: Error Handling

**User Story:** As a frontend developer, I want structured error information from all operations, so that I can provide meaningful feedback to users and debug issues.

#### Acceptance Criteria

1. WHEN a qpdf operation throws a C++ exception, THE Embind_Wrapper SHALL catch the exception and return a structured result containing the error message
2. THE TypeScript_Wrapper SHALL never throw raw Emscripten errors to the caller; all errors SHALL be wrapped in a consistent error type with a message property
3. IF WASM module initialization fails (e.g., network error loading .wasm file), THEN THE TypeScript_Wrapper SHALL reject the factory function promise with a descriptive error

### Requirement 10: Binary Data Transfer Efficiency

**User Story:** As a frontend developer, I want efficient binary data transfer between JavaScript and WASM, so that processing large PDFs and images does not cause excessive memory consumption or performance degradation.

#### Acceptance Criteria

1. THE Embind_Wrapper SHALL use `emscripten::typed_memory_view` for returning binary data (stream reads, PDF writes) to JavaScript, avoiding std::string-based binary encoding
2. THE TypeScript_Wrapper SHALL copy data out of the typed memory view into a new Uint8Array before returning it to the caller, ensuring the data remains valid after subsequent WASM calls that may resize or invalidate the WASM heap
3. THE Embind_Wrapper SHALL accept input binary data (PDF loading, stream replacement) via a pointer-and-length mechanism or `emscripten::val` to avoid UTF-8 string encoding of binary content
4. THE TypeScript_Wrapper SHALL support binary data transfers of at least 200 MB for both input and output operations, with peak memory usage during a transfer not exceeding 3 times the size of the transferred data
5. IF memory allocation fails during the Uint8Array copy in the TypeScript_Wrapper, THEN THE TypeScript_Wrapper SHALL throw an error indicating that insufficient memory is available for the binary data transfer, without corrupting previously returned data

### Requirement 11: Development Playground

**User Story:** As a developer on this project, I want a minimal browser-based playground for manually testing the WASM module end-to-end, so that I can verify the full workflow (load PDF, list images, replace stream, write PDF) during development.

#### Acceptance Criteria

1. THE Playground SHALL provide an HTML page that loads the WASM_Module, accepts a PDF file via drag-and-drop or file picker, displays the list of images, and allows downloading the modified PDF
2. THE Playground SHALL be excluded from the published npm package (listed in `.npmignore` or `files` field in `package.json`)
3. THE Playground SHALL be servable via a simple static HTTP server without requiring a bundler for development use
4. IF the WASM_Module fails to load in the Playground, THEN THE Playground SHALL display the error message in the page

### Requirement 12: Package Distribution

**User Story:** As a consumer of this package, I want a clean npm package containing only the WASM module, glue code, TypeScript wrapper, and type declarations, so that I can integrate it into my project without unnecessary files.

#### Acceptance Criteria

1. THE published npm package SHALL contain: the `.wasm` binary, the `.js` ES module glue code, the TypeScript wrapper source, and `.d.ts` type declarations
2. THE published npm package SHALL NOT contain: the Docker build environment, the C++ source code, the playground, test fixtures, or the qpdf source tree
3. THE published npm package SHALL specify `"type": "module"` and provide an `exports` map pointing to the TypeScript wrapper as the main entry point
4. THE published npm package SHALL declare the minimum Node.js version that supports WebAssembly and ES modules (Node.js >= 18)
