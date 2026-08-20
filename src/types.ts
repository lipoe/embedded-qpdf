/**
 * Public type definitions for the qpdf-image-streams TypeScript wrapper.
 *
 * These types define the ergonomic, type-safe API surface exposed to consumers.
 */

/**
 * Discriminated union representing either a successful result or an error.
 * All operations return this type instead of throwing exceptions.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Metadata for a single image XObject found in the PDF.
 */
export interface ImageInfo {
    /** PDF object ID */
    objId: number;
    /** PDF generation number */
    generation: number;
    /** Image width in pixels */
    width: number;
    /** Image height in pixels */
    height: number;
    /** Bits per color component, or null if not specified */
    bitsPerComponent: number | null;
    /** Color space name (e.g. "DeviceRGB"), or null if not specified */
    colorSpace: string | null;
    /** Compression filter name (e.g. "DCTDecode"), or null if not specified */
    filter: string | null;
    /** Encoded stream length in bytes */
    streamLength: number;
}

/**
 * Metadata fields for stream replacement. All fields are optional during replacement;
 * omitted fields preserve the original values.
 */
export interface ImageMetadata {
    width: number;
    height: number;
    bitsPerComponent: number;
    colorSpace: string;
    filter: string;
}

/**
 * Handle to a loaded PDF document. Provides methods for image enumeration,
 * stream reading/replacement, PDF writing, and resource cleanup.
 */
export interface PdfDocument {
    /** Enumerate all image XObjects in the PDF. */
    getImages(options?: { recursive?: boolean }): Result<ImageInfo[]>;
    /** Read decoded (decompressed) stream data for an image. */
    getImageStreamData(objId: number, generation: number): Result<Uint8Array>;
    /** Read raw (compressed/encoded) stream data for an image. */
    getRawImageStreamData(objId: number, generation: number): Result<Uint8Array>;
    /**
     * Replace image stream content and optionally update metadata.
     * Omitted metadata fields preserve original values.
     */
    replaceImageStream(
        objId: number,
        generation: number,
        data: Uint8Array,
        metadata?: Partial<ImageMetadata>
    ): Result<void>;
    /** Write the (possibly modified) PDF to a new Uint8Array. */
    writePdf(): Result<Uint8Array>;
    /**
     * Release all WASM memory held by this document.
     * After calling close(), all other methods will return an error result.
     * Multiple calls to close() are no-ops.
     */
    close(): void;
}

/**
 * Top-level API object returned by the factory function.
 * Use loadPdf or loadPdfWithPassword to open a PDF document.
 */
export interface QpdfImageStreams {
    /** Load an unprotected PDF from binary data. */
    loadPdf(data: Uint8Array): Result<PdfDocument>;
    /** Load a password-protected PDF from binary data. */
    loadPdfWithPassword(data: Uint8Array, password: string): Result<PdfDocument>;
}

/**
 * Options for the createQpdfImageStreams factory function.
 */
export interface CreateOptions {
    /**
     * Override WASM file URL resolution for CDN or bundler compatibility.
     * Called by Emscripten to resolve the .wasm file path.
     */
    locateFile?: (filename: string) => string;
}
