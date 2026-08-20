/**
 * Property-based tests for invalid metadata rejection.
 *
 * Property 8: Invalid Metadata Rejection
 * - Any negative width, height, or bitsPerComponent causes `replaceImageStream`
 *   to return `{ ok: false }` without calling WASM.
 *
 * **Validates: Requirements 11.8**
 *
 * @module pbt/invalid-metadata
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { mockWasm } from '../__mocks__/qpdf-image-stream.js';
import { createQpdfImageStreams } from '../../src/index.js';

// --- Generators ---
const negativeWidth = fc.integer({ min: -10000, max: -1 });
const negativeHeight = fc.integer({ min: -10000, max: -1 });
const negativeBpc = fc.integer({ min: -100, max: -1 });
const validObjId = fc.integer({ min: 1, max: 10000 });
const validGeneration = fc.integer({ min: 0, max: 100 });
const validData = fc.uint8Array({ minLength: 1, maxLength: 100 });

describe('Feature: qpdf-wasm-image-streams, Property 8: Invalid Metadata Rejection', () => {
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

    it('for any negative width, replaceImageStream returns { ok: false } and WASM is NOT called', async () => {
        const qpdf = await createQpdfImageStreams();

        await fc.assert(
            fc.asyncProperty(
                validObjId,
                validGeneration,
                validData,
                negativeWidth,
                async (objId, generation, data, width) => {
                    let wasCalled = false;
                    mockWasm.replaceImageStream = () => {
                        wasCalled = true;
                        return { success: true };
                    };

                    const loadResult = qpdf.loadPdf(new Uint8Array([37, 80, 68, 70]));
                    expect(loadResult.ok).toBe(true);
                    if (!loadResult.ok) return;

                    const result = loadResult.value.replaceImageStream(objId, generation, data, {
                        width,
                        height: 100,
                        bitsPerComponent: 8,
                        colorSpace: '/DeviceRGB',
                        filter: '/FlateDecode',
                    });

                    expect(result.ok).toBe(false);
                    expect(wasCalled).toBe(false);

                    loadResult.value.close();
                }
            ),
            { numRuns: 100 }
        );
    });

    it('for any negative height, replaceImageStream returns { ok: false } and WASM is NOT called', async () => {
        const qpdf = await createQpdfImageStreams();

        await fc.assert(
            fc.asyncProperty(
                validObjId,
                validGeneration,
                validData,
                negativeHeight,
                async (objId, generation, data, height) => {
                    let wasCalled = false;
                    mockWasm.replaceImageStream = () => {
                        wasCalled = true;
                        return { success: true };
                    };

                    const loadResult = qpdf.loadPdf(new Uint8Array([37, 80, 68, 70]));
                    expect(loadResult.ok).toBe(true);
                    if (!loadResult.ok) return;

                    const result = loadResult.value.replaceImageStream(objId, generation, data, {
                        width: 100,
                        height,
                        bitsPerComponent: 8,
                        colorSpace: '/DeviceRGB',
                        filter: '/FlateDecode',
                    });

                    expect(result.ok).toBe(false);
                    expect(wasCalled).toBe(false);

                    loadResult.value.close();
                }
            ),
            { numRuns: 100 }
        );
    });

    it('for any negative bitsPerComponent, replaceImageStream returns { ok: false } and WASM is NOT called', async () => {
        const qpdf = await createQpdfImageStreams();

        await fc.assert(
            fc.asyncProperty(
                validObjId,
                validGeneration,
                validData,
                negativeBpc,
                async (objId, generation, data, bpc) => {
                    let wasCalled = false;
                    mockWasm.replaceImageStream = () => {
                        wasCalled = true;
                        return { success: true };
                    };

                    const loadResult = qpdf.loadPdf(new Uint8Array([37, 80, 68, 70]));
                    expect(loadResult.ok).toBe(true);
                    if (!loadResult.ok) return;

                    const result = loadResult.value.replaceImageStream(objId, generation, data, {
                        width: 100,
                        height: 100,
                        bitsPerComponent: bpc,
                        colorSpace: '/DeviceRGB',
                        filter: '/FlateDecode',
                    });

                    expect(result.ok).toBe(false);
                    expect(wasCalled).toBe(false);

                    loadResult.value.close();
                }
            ),
            { numRuns: 100 }
        );
    });
});
