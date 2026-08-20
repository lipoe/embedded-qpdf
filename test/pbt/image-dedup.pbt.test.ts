/**
 * Property-based tests for image deduplication.
 *
 * **Validates: Requirements 11.7**
 *
 * The deduplication logic happens in the C++ WASM layer (using std::set<QPDFObjGen>).
 * The TypeScript wrapper passes through whatever the WASM returns.
 *
 * Properties tested:
 * 1. When WASM returns an array of images, the wrapper returns them faithfully as ImageInfo[].
 * 2. When WASM returns a deduplicated list (all unique objId+generation pairs),
 *    the result has no duplicates.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { createQpdfImageStreams } from '../../src/index.js';
import { mockWasm } from '../__mocks__/qpdf-image-stream.js';

// --- Generators ---

const imageInfo = fc.record({
    objId: fc.integer({ min: 1, max: 100 }),
    generation: fc.integer({ min: 0, max: 5 }),
    width: fc.integer({ min: 1, max: 10000 }),
    height: fc.integer({ min: 1, max: 10000 }),
    bitsPerComponent: fc.oneof(fc.constant(null), fc.constantFrom(1, 2, 4, 8, 16)),
    colorSpace: fc.oneof(fc.constant(null), fc.constantFrom('/DeviceRGB', '/DeviceGray')),
    filter: fc.oneof(fc.constant(null), fc.constantFrom('/DCTDecode', '/FlateDecode')),
    streamLength: fc.integer({ min: 0, max: 100000 }),
});

const imageList = fc.array(imageInfo, { minLength: 0, maxLength: 20 });

/** Generator for deduplicated image lists (unique objId+generation pairs) */
const deduplicatedImageList = imageList.map((images) => {
    const seen = new Set<string>();
    return images.filter((img) => {
        const key = `${img.objId}:${img.generation}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
});

describe('Property 7: Image Deduplication', () => {
    beforeEach(() => {
        // Reset all mock functions to defaults
        mockWasm.loadPdf = null;
        mockWasm.loadPdfWithPassword = null;
        mockWasm.getImages = null;
        mockWasm.getImageStreamData = null;
        mockWasm.getRawImageStreamData = null;
        mockWasm.replaceImageStream = null;
        mockWasm.writePdf = null;
        mockWasm.close = null;
        mockWasm.getPageCount = null;
    });

    it('wrapper returns exactly what WASM provides (faithful pass-through of ImageInfo[])', async () => {
        const qpdf = await createQpdfImageStreams();
        const loadResult = qpdf.loadPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
        expect(loadResult.ok).toBe(true);
        if (!loadResult.ok) return;

        const doc = loadResult.value;

        fc.assert(
            fc.property(imageList, (generatedImages) => {
                // Configure mock to return the generated list
                mockWasm.getImages = () => generatedImages;

                const result = doc.getImages({ recursive: true });
                expect(result.ok).toBe(true);
                if (!result.ok) return;

                // The wrapper should return exactly what WASM provides
                expect(result.value).toEqual(generatedImages);
                expect(result.value.length).toBe(generatedImages.length);
            }),
            { numRuns: 100 },
        );

        doc.close();
    });

    it('when WASM returns a deduplicated list, result contains no duplicate objId+generation pairs', async () => {
        const qpdf = await createQpdfImageStreams();
        const loadResult = qpdf.loadPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
        expect(loadResult.ok).toBe(true);
        if (!loadResult.ok) return;

        const doc = loadResult.value;

        fc.assert(
            fc.property(deduplicatedImageList, (uniqueImages) => {
                // Configure mock to return the deduplicated list (simulating WASM's std::set behavior)
                mockWasm.getImages = () => uniqueImages;

                const result = doc.getImages({ recursive: true });
                expect(result.ok).toBe(true);
                if (!result.ok) return;

                // Verify no duplicates in the result
                const seen = new Set<string>();
                for (const img of result.value) {
                    const key = `${img.objId}:${img.generation}`;
                    expect(seen.has(key)).toBe(false);
                    seen.add(key);
                }

                // All unique images are present
                expect(result.value.length).toBe(uniqueImages.length);
            }),
            { numRuns: 100 },
        );

        doc.close();
    });
});
