import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createQpdfImageStreams } from '../../src/index.js';
import { mockWasm } from '../__mocks__/qpdf-image-stream.js';
import type { PdfDocument, QpdfImageStreams } from '../../src/types.js';

/**
 * Unit tests for image enumeration (getImages) and stream reading
 * (getImageStreamData, getRawImageStreamData) in the TypeScript wrapper.
 *
 * These tests use the shared WASM mock to isolate the TypeScript wrapper logic:
 * - Result type mapping
 * - Input validation
 * - Memory copying (typed_memory_view → new Uint8Array)
 * - Lifecycle guards (closed state)
 * - Recursive vs non-recursive enumeration
 *
 * Requirements covered: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 4.1, 4.2, 4.3
 */

describe('Image Enumeration and Stream Reading', () => {
    let api: QpdfImageStreams;
    let doc: PdfDocument;

    beforeEach(async () => {
        // Reset all mock functions
        mockWasm.loadPdf = null;
        mockWasm.loadPdfWithPassword = null;
        mockWasm.getImages = null;
        mockWasm.getImageStreamData = null;
        mockWasm.getRawImageStreamData = null;
        mockWasm.replaceImageStream = null;
        mockWasm.writePdf = null;
        mockWasm.close = null;
        mockWasm.getPageCount = null;

        api = await createQpdfImageStreams();
        const result = api.loadPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46])); // %PDF
        if (!result.ok) throw new Error('loadPdf failed in setup');
        doc = result.value;
    });

    afterEach(() => {
        doc.close();
    });

    // ========================================================================
    // Image Enumeration - getImages()
    // ========================================================================

    describe('getImages()', () => {
        it('returns correct count and metadata for multiple images (Req 3.1, 3.2)', () => {
            const mockImages = [
                {
                    objId: 5,
                    generation: 0,
                    width: 400,
                    height: 300,
                    bitsPerComponent: 8,
                    colorSpace: '/DeviceRGB',
                    filter: '/DCTDecode',
                    streamLength: 15000,
                },
                {
                    objId: 8,
                    generation: 0,
                    width: 200,
                    height: 200,
                    bitsPerComponent: 8,
                    colorSpace: '/DeviceGray',
                    filter: '/FlateDecode',
                    streamLength: 5000,
                },
                {
                    objId: 12,
                    generation: 1,
                    width: 1024,
                    height: 768,
                    bitsPerComponent: 16,
                    colorSpace: '/DeviceCMYK',
                    filter: null,
                    streamLength: 6291456,
                },
            ];

            mockWasm.getImages = () => mockImages;

            const result = doc.getImages();

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('getImages failed');

            expect(result.value).toHaveLength(3);
            expect(result.value[0]).toEqual({
                objId: 5,
                generation: 0,
                width: 400,
                height: 300,
                bitsPerComponent: 8,
                colorSpace: '/DeviceRGB',
                filter: '/DCTDecode',
                streamLength: 15000,
            });
            expect(result.value[1]).toEqual({
                objId: 8,
                generation: 0,
                width: 200,
                height: 200,
                bitsPerComponent: 8,
                colorSpace: '/DeviceGray',
                filter: '/FlateDecode',
                streamLength: 5000,
            });
            expect(result.value[2]).toEqual({
                objId: 12,
                generation: 1,
                width: 1024,
                height: 768,
                bitsPerComponent: 16,
                colorSpace: '/DeviceCMYK',
                filter: null,
                streamLength: 6291456,
            });
        });

        it('returns empty list for PDF with no images (Req 3.7)', () => {
            mockWasm.getImages = () => [];

            const result = doc.getImages();

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('getImages failed');
            expect(result.value).toEqual([]);
            expect(result.value).toHaveLength(0);
        });

        it('passes recursive=false by default (Req 3.4)', () => {
            let receivedRecursive: boolean | undefined;
            mockWasm.getImages = (recursive: boolean) => {
                receivedRecursive = recursive;
                return [];
            };

            doc.getImages();

            expect(receivedRecursive).toBe(false);
        });

        it('passes recursive=true when specified and finds nested images (Req 3.4)', () => {
            const pageImages = [
                {
                    objId: 5,
                    generation: 0,
                    width: 200,
                    height: 200,
                    bitsPerComponent: 8,
                    colorSpace: '/DeviceRGB',
                    filter: null,
                    streamLength: 1200,
                },
            ];

            const allImages = [
                ...pageImages,
                {
                    objId: 10,
                    generation: 0,
                    width: 300,
                    height: 300,
                    bitsPerComponent: 8,
                    colorSpace: '/DeviceRGB',
                    filter: null,
                    streamLength: 2700,
                },
            ];

            mockWasm.getImages = (recursive: boolean) => {
                return recursive ? allImages : pageImages;
            };

            const nonRecursive = doc.getImages({ recursive: false });
            expect(nonRecursive.ok).toBe(true);
            if (!nonRecursive.ok) throw new Error('unexpected');
            expect(nonRecursive.value).toHaveLength(1);

            const recursive = doc.getImages({ recursive: true });
            expect(recursive.ok).toBe(true);
            if (!recursive.ok) throw new Error('unexpected');
            expect(recursive.value).toHaveLength(2);
            expect(recursive.value[1].objId).toBe(10);
        });

        it('returns null for missing optional fields (Req 3.3)', () => {
            mockWasm.getImages = () => [
                {
                    objId: 7,
                    generation: 0,
                    width: 100,
                    height: 100,
                    bitsPerComponent: null,
                    colorSpace: null,
                    filter: null,
                    streamLength: 10000,
                },
            ];

            const result = doc.getImages();

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('getImages failed');

            expect(result.value[0].bitsPerComponent).toBeNull();
            expect(result.value[0].colorSpace).toBeNull();
            expect(result.value[0].filter).toBeNull();
            // Non-optional fields are still present
            expect(result.value[0].width).toBe(100);
            expect(result.value[0].height).toBe(100);
            expect(result.value[0].objId).toBe(7);
            expect(result.value[0].streamLength).toBe(10000);
        });

        it('reports each unique image only once - deduplication (Req 3.6)', () => {
            // WASM layer handles deduplication; verify the TS wrapper passes it through
            mockWasm.getImages = () => [
                {
                    objId: 5,
                    generation: 0,
                    width: 100,
                    height: 100,
                    bitsPerComponent: 8,
                    colorSpace: '/DeviceRGB',
                    filter: null,
                    streamLength: 300,
                },
            ];

            const result = doc.getImages({ recursive: true });

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('unexpected');
            // Even if image is referenced from multiple pages, it appears once
            expect(result.value).toHaveLength(1);
            expect(result.value[0].objId).toBe(5);
        });

        it('returns error when WASM returns error object', () => {
            mockWasm.getImages = () => ({
                success: false,
                error: 'Internal error during image enumeration',
            });

            const result = doc.getImages();

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('Internal error during image enumeration');
        });

        it('returns error when WASM throws an exception', () => {
            mockWasm.getImages = () => {
                throw new Error('WASM memory access out of bounds');
            };

            const result = doc.getImages();

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('WASM memory access out of bounds');
        });

        it('returns disposed error after close() (Req 7.3)', () => {
            doc.close();

            const result = doc.getImages();

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('disposed');
        });
    });

    // ========================================================================
    // Decoded Stream Reading - getImageStreamData()
    // ========================================================================

    describe('getImageStreamData()', () => {
        it('returns decoded stream data as Uint8Array with expected byte length (Req 4.1)', () => {
            // Simulate a 2x2 RGB image: 2*2*3 = 12 bytes decoded
            const decodedPixels = new Uint8Array([
                255, 0, 0, 0, 255, 0, 0, 0, 255, 128, 128, 128,
            ]);
            mockWasm.getImageStreamData = () => decodedPixels;

            const result = doc.getImageStreamData(5, 0);

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('unexpected');
            expect(result.value).toBeInstanceOf(Uint8Array);
            expect(result.value.byteLength).toBe(12);
            expect(result.value[0]).toBe(255); // First pixel red channel
        });

        it('copies data into a new Uint8Array (not a view) (Req 4.5, 10.2)', () => {
            const wasmBuffer = new Uint8Array([1, 2, 3, 4, 5]);
            mockWasm.getImageStreamData = () => wasmBuffer;

            const result = doc.getImageStreamData(5, 0);

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('unexpected');

            // The returned Uint8Array should be a copy, not the same reference
            expect(result.value).not.toBe(wasmBuffer);
            expect(result.value).toEqual(wasmBuffer);

            // Modifying the original should not affect the returned copy
            wasmBuffer[0] = 99;
            expect(result.value[0]).toBe(1);
        });

        it('returns error for non-existent object ID (Req 4.3)', () => {
            mockWasm.getImageStreamData = () => ({
                success: false,
                error: 'Object not found: 999 0',
            });

            const result = doc.getImageStreamData(999, 0);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('Object not found');
        });

        it('returns validation error for negative objId', () => {
            const result = doc.getImageStreamData(-1, 0);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('Invalid object ID');
        });

        it('returns validation error for non-integer objId', () => {
            const result = doc.getImageStreamData(5.5, 0);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('Invalid object ID');
        });

        it('returns validation error for negative generation', () => {
            const result = doc.getImageStreamData(5, -1);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('Invalid generation number');
        });

        it('returns validation error for non-integer generation', () => {
            const result = doc.getImageStreamData(5, 1.5);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('Invalid generation number');
        });

        it('returns disposed error after close()', () => {
            doc.close();

            const result = doc.getImageStreamData(5, 0);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('disposed');
        });

        it('handles WASM exception gracefully', () => {
            mockWasm.getImageStreamData = () => {
                throw new Error('Filter decode failure: unsupported JBIG2');
            };

            const result = doc.getImageStreamData(5, 0);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('Filter decode failure');
        });
    });

    // ========================================================================
    // Raw Stream Reading - getRawImageStreamData()
    // ========================================================================

    describe('getRawImageStreamData()', () => {
        it('returns raw (encoded) stream data as Uint8Array (Req 4.2)', () => {
            // Simulate JPEG-compressed data (smaller than decoded)
            const rawJpegData = new Uint8Array([
                0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
            ]);
            mockWasm.getRawImageStreamData = () => rawJpegData;

            const result = doc.getRawImageStreamData(5, 0);

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('unexpected');
            expect(result.value).toBeInstanceOf(Uint8Array);
            expect(result.value.byteLength).toBe(8);
            // Verify JPEG magic bytes
            expect(result.value[0]).toBe(0xff);
            expect(result.value[1]).toBe(0xd8);
        });

        it('copies data into a new Uint8Array (not a view) (Req 4.5, 10.2)', () => {
            const wasmBuffer = new Uint8Array([10, 20, 30, 40]);
            mockWasm.getRawImageStreamData = () => wasmBuffer;

            const result = doc.getRawImageStreamData(5, 0);

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('unexpected');

            // The returned Uint8Array should be a copy
            expect(result.value).not.toBe(wasmBuffer);
            expect(result.value).toEqual(wasmBuffer);

            // Mutating original doesn't affect copy
            wasmBuffer[0] = 99;
            expect(result.value[0]).toBe(10);
        });

        it('returns error for non-existent object ID (Req 4.3)', () => {
            mockWasm.getRawImageStreamData = () => ({
                success: false,
                error: 'Object not found: 500 0',
            });

            const result = doc.getRawImageStreamData(500, 0);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('Object not found');
        });

        it('returns validation error for negative objId', () => {
            const result = doc.getRawImageStreamData(-5, 0);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('Invalid object ID');
        });

        it('returns validation error for non-integer objId', () => {
            const result = doc.getRawImageStreamData(3.14, 0);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('Invalid object ID');
        });

        it('returns validation error for negative generation', () => {
            const result = doc.getRawImageStreamData(5, -2);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('Invalid generation number');
        });

        it('returns disposed error after close()', () => {
            doc.close();

            const result = doc.getRawImageStreamData(5, 0);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('disposed');
        });

        it('handles WASM exception gracefully', () => {
            mockWasm.getRawImageStreamData = () => {
                throw new Error('Stream data read failed');
            };

            const result = doc.getRawImageStreamData(5, 0);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('expected error');
            expect(result.error).toContain('Stream data read failed');
        });
    });

    // ========================================================================
    // Edge Cases and Cross-Cutting Concerns
    // ========================================================================

    describe('Edge Cases', () => {
        it('allows objId=0 and generation=0 as valid values', () => {
            let calledWith: { objId: number; gen: number } | null = null;
            mockWasm.getImageStreamData = (objId: number, gen: number) => {
                calledWith = { objId, gen };
                return new Uint8Array([1, 2, 3]);
            };

            const result = doc.getImageStreamData(0, 0);

            expect(result.ok).toBe(true);
            expect(calledWith).toEqual({ objId: 0, gen: 0 });
        });

        it('handles large stream data correctly', () => {
            // Simulate a large 4096x4096 RGB image: 4096*4096*3 = 50,331,648 bytes
            const largeData = new Uint8Array(50_331_648);
            largeData[0] = 42;
            largeData[50_331_647] = 99;
            mockWasm.getImageStreamData = () => largeData;

            const result = doc.getImageStreamData(5, 0);

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('unexpected');
            expect(result.value.byteLength).toBe(50_331_648);
            expect(result.value[0]).toBe(42);
            expect(result.value[50_331_647]).toBe(99);
        });

        it('getImages without options uses default recursive=false', () => {
            let receivedRecursive: boolean | undefined;
            mockWasm.getImages = (recursive: boolean) => {
                receivedRecursive = recursive;
                return [];
            };

            doc.getImages(); // No options at all

            expect(receivedRecursive).toBe(false);
        });

        it('getImages with empty options object uses default recursive=false', () => {
            let receivedRecursive: boolean | undefined;
            mockWasm.getImages = (recursive: boolean) => {
                receivedRecursive = recursive;
                return [];
            };

            doc.getImages({}); // Empty options

            expect(receivedRecursive).toBe(false);
        });
    });
});
