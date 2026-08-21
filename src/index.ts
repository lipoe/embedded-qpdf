/**
 * @module @lipoe/browser-qpdf
 *
 * Browser-compatible WASM module exposing qpdf's library API for reading
 * and replacing PDF image streams.
 *
 * Usage:
 * ```typescript
 * import { createQpdfImageStreams } from '@lipoe/browser-qpdf';
 *
 * const qpdf = await createQpdfImageStreams();
 * const result = qpdf.loadPdf(pdfBytes);
 * if (result.ok) {
 *     const images = result.value.getImages();
 *     // ...
 *     result.value.close();
 * }
 * ```
 *
 * Memory ownership: The caller is responsible for calling `close()` on
 * the PdfDocument to release WASM memory. Failure to do so will leak memory.
 */

import type {
    CreateOptions,
    QpdfImageStreams,
    Result,
    PdfDocument,
    ImageInfo,
    ImageMetadata,
} from './types.js';

// Re-export all public types
export type {
    Result,
    ImageInfo,
    ImageMetadata,
    PdfDocument,
    QpdfImageStreams,
    CreateOptions,
} from './types.js';

// --- Internal types for the raw WASM module ---

/** Shape of the Emscripten-generated module factory default export. */
interface WasmModuleFactory {
    (options?: { locateFile?: (filename: string) => string }): Promise<WasmModule>;
}

/** Internal type for the instantiated WASM module. */
interface WasmModule {
    QpdfWasmWrapper: new () => RawWrapper;
}

/** Internal type matching the Embind-exposed C++ class methods. */
interface RawWrapper {
    loadPdf(data: Uint8Array): { success: boolean; error?: string };
    loadPdfWithPassword(data: Uint8Array, password: string): { success: boolean; error?: string };
    getImages(recursive: boolean): unknown;
    getImageStreamData(objId: number, gen: number): unknown;
    getRawImageStreamData(objId: number, gen: number): unknown;
    replaceImageStream(objId: number, gen: number, data: Uint8Array, metadata: unknown): { success: boolean; error?: string };
    writePdf(): unknown;
    close(): void;
    getPageCount(): number;
}

/**
 * Create and initialize the qpdf WASM image streams API.
 *
 * This async factory function loads the WASM module, awaits initialization,
 * and returns a ready-to-use API object. If WASM loading fails (e.g. network
 * error fetching the .wasm file), the returned promise rejects with a
 * descriptive Error.
 *
 * @param options - Optional configuration for WASM loading.
 * @returns A promise that resolves to the QpdfImageStreams API object.
 *
 * @example
 * ```typescript
 * const qpdf = await createQpdfImageStreams({
 *     locateFile: (name) => `/assets/wasm/${name}`
 * });
 * ```
 */
export async function createQpdfImageStreams(
    options?: CreateOptions
): Promise<QpdfImageStreams> {
    try {
        // Dynamically import the Emscripten-generated glue code.
        // Both index.js and qpdf-image-stream.js reside in dist/ after build.
        const { default: createQpdfModule }: { default: WasmModuleFactory } =
            await import('./qpdf-image-stream.js' as string);

        const moduleOptions: { locateFile?: (filename: string) => string } = {};
        if (options?.locateFile) {
            moduleOptions.locateFile = options.locateFile;
        }

        const wasmModule: WasmModule = await createQpdfModule(moduleOptions);

        /** Maximum input PDF size: 256 MB */
        const MAX_PDF_SIZE = 256 * 1024 * 1024;

        /**
         * Creates a PdfDocument implementation wrapping a raw WASM wrapper instance.
         * The returned object provides lifecycle-guarded access to all PDF operations.
         */
        function createPdfDocument(wrapper: RawWrapper): PdfDocument {
            let closed = false;

            return {
                getImages(options?: { recursive?: boolean }): Result<ImageInfo[]> {
                    if (closed) return { ok: false, error: 'Instance has been disposed' };

                    try {
                        const recursive = options?.recursive ?? false;
                        const result = wrapper.getImages(recursive);

                        // Check if result is a WASM error object
                        if (
                            result &&
                            typeof result === 'object' &&
                            'success' in (result as Record<string, unknown>) &&
                            !(result as Record<string, unknown>).success
                        ) {
                            return {
                                ok: false,
                                error:
                                    ((result as Record<string, unknown>).error as string) ||
                                    'Failed to get images',
                            };
                        }

                        // Result is an array of ImageInfo objects
                        return { ok: true, value: result as ImageInfo[] };
                    } catch (err: unknown) {
                        return {
                            ok: false,
                            error: err instanceof Error ? err.message : String(err),
                        };
                    }
                },

                getImageStreamData(objId: number, generation: number): Result<Uint8Array> {
                    if (closed) return { ok: false, error: 'Instance has been disposed' };
                    if (!Number.isInteger(objId) || objId < 0)
                        return { ok: false, error: 'Invalid object ID' };
                    if (!Number.isInteger(generation) || generation < 0)
                        return { ok: false, error: 'Invalid generation number' };

                    try {
                        const result = wrapper.getImageStreamData(objId, generation);

                        // Check if result is a WASM error object
                        if (
                            result &&
                            typeof result === 'object' &&
                            'success' in (result as Record<string, unknown>) &&
                            !(result as Record<string, unknown>).success
                        ) {
                            return {
                                ok: false,
                                error:
                                    ((result as Record<string, unknown>).error as string) ||
                                    'Failed to get stream data',
                            };
                        }

                        // Copy typed_memory_view into a new Uint8Array so data remains valid
                        return { ok: true, value: new Uint8Array(result as Uint8Array) };
                    } catch (err: unknown) {
                        return {
                            ok: false,
                            error: err instanceof Error ? err.message : String(err),
                        };
                    }
                },

                getRawImageStreamData(objId: number, generation: number): Result<Uint8Array> {
                    if (closed) return { ok: false, error: 'Instance has been disposed' };
                    if (!Number.isInteger(objId) || objId < 0)
                        return { ok: false, error: 'Invalid object ID' };
                    if (!Number.isInteger(generation) || generation < 0)
                        return { ok: false, error: 'Invalid generation number' };

                    try {
                        const result = wrapper.getRawImageStreamData(objId, generation);

                        if (
                            result &&
                            typeof result === 'object' &&
                            'success' in (result as Record<string, unknown>) &&
                            !(result as Record<string, unknown>).success
                        ) {
                            return {
                                ok: false,
                                error:
                                    ((result as Record<string, unknown>).error as string) ||
                                    'Failed to get raw stream data',
                            };
                        }

                        // Copy typed_memory_view into a new Uint8Array
                        return { ok: true, value: new Uint8Array(result as Uint8Array) };
                    } catch (err: unknown) {
                        return {
                            ok: false,
                            error: err instanceof Error ? err.message : String(err),
                        };
                    }
                },

                replaceImageStream(
                    objId: number,
                    generation: number,
                    data: Uint8Array,
                    metadata?: Partial<ImageMetadata>
                ): Result<void> {
                    if (closed) return { ok: false, error: 'Instance has been disposed' };
                    if (!(data instanceof Uint8Array))
                        return { ok: false, error: 'Data must be a Uint8Array' };
                    if (!Number.isInteger(objId) || objId < 0)
                        return { ok: false, error: 'Invalid object ID' };
                    if (!Number.isInteger(generation) || generation < 0)
                        return { ok: false, error: 'Invalid generation number' };

                    // Validate metadata if provided
                    if (metadata) {
                        if (metadata.width !== undefined && metadata.width < 0)
                            return {
                                ok: false,
                                error: 'Invalid metadata: width must not be negative',
                            };
                        if (metadata.height !== undefined && metadata.height < 0)
                            return {
                                ok: false,
                                error: 'Invalid metadata: height must not be negative',
                            };
                        if (
                            metadata.bitsPerComponent !== undefined &&
                            metadata.bitsPerComponent < 0
                        )
                            return {
                                ok: false,
                                error: 'Invalid metadata: bitsPerComponent must not be negative',
                            };
                    }

                    try {
                        // Build metadata object for WASM:
                        // 0 for integers and empty string for strings means "preserve original"
                        // Normalize: strip leading slash from filter/colorSpace if provided,
                        // the C++ wrapper adds the PDF name prefix automatically.
                        const normalizeFilter = (v: string) =>
                            v.startsWith('/') ? v.slice(1) : v;

                        const wasmMetadata = {
                            width: metadata?.width ?? 0,
                            height: metadata?.height ?? 0,
                            bitsPerComponent: metadata?.bitsPerComponent ?? 0,
                            colorSpace: metadata?.colorSpace
                                ? normalizeFilter(metadata.colorSpace)
                                : '',
                            filter: metadata?.filter
                                ? normalizeFilter(metadata.filter)
                                : '',
                        };

                        const result = wrapper.replaceImageStream(
                            objId,
                            generation,
                            data,
                            wasmMetadata
                        );

                        if (!result.success) {
                            return {
                                ok: false,
                                error: result.error || 'Failed to replace stream',
                            };
                        }

                        return { ok: true, value: undefined };
                    } catch (err: unknown) {
                        return {
                            ok: false,
                            error: err instanceof Error ? err.message : String(err),
                        };
                    }
                },

                writePdf(): Result<Uint8Array> {
                    if (closed) return { ok: false, error: 'Instance has been disposed' };

                    try {
                        const result = wrapper.writePdf();

                        if (
                            result &&
                            typeof result === 'object' &&
                            'success' in (result as Record<string, unknown>) &&
                            !(result as Record<string, unknown>).success
                        ) {
                            return {
                                ok: false,
                                error:
                                    ((result as Record<string, unknown>).error as string) ||
                                    'Failed to write PDF',
                            };
                        }

                        // Copy typed_memory_view into a new Uint8Array
                        return { ok: true, value: new Uint8Array(result as Uint8Array) };
                    } catch (err: unknown) {
                        return {
                            ok: false,
                            error: err instanceof Error ? err.message : String(err),
                        };
                    }
                },

                close(): void {
                    if (closed) return; // no-op on subsequent calls
                    closed = true;
                    wrapper.close();
                },
            };
        }

        return {
            loadPdf(data: Uint8Array): Result<PdfDocument> {
                // Input validation
                if (!(data instanceof Uint8Array)) {
                    return { ok: false, error: 'Input must be a Uint8Array' };
                }
                if (data.byteLength > MAX_PDF_SIZE) {
                    return { ok: false, error: 'Data exceeds 256 MB limit' };
                }

                try {
                    // Create a new wrapper instance per document
                    const wrapper = new wasmModule.QpdfWasmWrapper();
                    const result = wrapper.loadPdf(data);

                    if (!result.success) {
                        return { ok: false, error: result.error || 'Failed to load PDF' };
                    }

                    return { ok: true, value: createPdfDocument(wrapper) };
                } catch (err: unknown) {
                    return {
                        ok: false,
                        error: err instanceof Error ? err.message : String(err),
                    };
                }
            },

            loadPdfWithPassword(data: Uint8Array, password: string): Result<PdfDocument> {
                // Input validation
                if (!(data instanceof Uint8Array)) {
                    return { ok: false, error: 'Input must be a Uint8Array' };
                }
                if (data.byteLength > MAX_PDF_SIZE) {
                    return { ok: false, error: 'Data exceeds 256 MB limit' };
                }

                try {
                    // Create a new wrapper instance per document
                    const wrapper = new wasmModule.QpdfWasmWrapper();
                    const result = wrapper.loadPdfWithPassword(data, password);

                    if (!result.success) {
                        return { ok: false, error: result.error || 'Failed to load PDF' };
                    }

                    return { ok: true, value: createPdfDocument(wrapper) };
                } catch (err: unknown) {
                    return {
                        ok: false,
                        error: err instanceof Error ? err.message : String(err),
                    };
                }
            },
        };
    } catch (err: unknown) {
        throw new Error(
            `Failed to initialize WASM module: ${err instanceof Error ? err.message : String(err)}`
        );
    }
}
