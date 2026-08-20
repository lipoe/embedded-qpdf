/**
 * Property-based tests for disposed instance rejection.
 *
 * Property 6: Disposed Instance Rejection
 * - After close(), every method call returns { ok: false } with "disposed" error
 * - close() is idempotent (no error on repeated calls)
 *
 * **Validates: Requirements 11.6**
 *
 * @module pbt/disposed-instance
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { mockWasm } from '../__mocks__/qpdf-image-stream.js';
import { createQpdfImageStreams } from '../../src/index.js';

// --- Generators ---
const objId = fc.integer({ min: 1, max: 10000 });
const generation = fc.integer({ min: 0, max: 100 });
const data = fc.uint8Array({ minLength: 1, maxLength: 100 });
const closeCount = fc.integer({ min: 1, max: 100 });

describe('Feature: qpdf-wasm-image-streams, Property 6: Disposed Instance Rejection', () => {
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

    it('after close(), getImages returns { ok: false } with "disposed" for any valid input', async () => {
        const qpdf = await createQpdfImageStreams();
        const loadResult = qpdf.loadPdf(new Uint8Array([37, 80, 68, 70]));
        expect(loadResult.ok).toBe(true);
        if (!loadResult.ok) return;

        const doc = loadResult.value;
        doc.close();

        fc.assert(
            fc.property(fc.boolean(), (recursive) => {
                const result = doc.getImages({ recursive });
                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error.toLowerCase()).toContain('disposed');
                }
            }),
            { numRuns: 100 },
        );
    });

    it('after close(), getImageStreamData returns { ok: false } with "disposed" for any objId/generation', async () => {
        const qpdf = await createQpdfImageStreams();
        const loadResult = qpdf.loadPdf(new Uint8Array([37, 80, 68, 70]));
        expect(loadResult.ok).toBe(true);
        if (!loadResult.ok) return;

        const doc = loadResult.value;
        doc.close();

        fc.assert(
            fc.property(objId, generation, (id, gen) => {
                const result = doc.getImageStreamData(id, gen);
                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error.toLowerCase()).toContain('disposed');
                }
            }),
            { numRuns: 100 },
        );
    });

    it('after close(), getRawImageStreamData returns { ok: false } with "disposed" for any objId/generation', async () => {
        const qpdf = await createQpdfImageStreams();
        const loadResult = qpdf.loadPdf(new Uint8Array([37, 80, 68, 70]));
        expect(loadResult.ok).toBe(true);
        if (!loadResult.ok) return;

        const doc = loadResult.value;
        doc.close();

        fc.assert(
            fc.property(objId, generation, (id, gen) => {
                const result = doc.getRawImageStreamData(id, gen);
                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error.toLowerCase()).toContain('disposed');
                }
            }),
            { numRuns: 100 },
        );
    });

    it('after close(), replaceImageStream returns { ok: false } with "disposed" for any objId/generation/data', async () => {
        const qpdf = await createQpdfImageStreams();
        const loadResult = qpdf.loadPdf(new Uint8Array([37, 80, 68, 70]));
        expect(loadResult.ok).toBe(true);
        if (!loadResult.ok) return;

        const doc = loadResult.value;
        doc.close();

        fc.assert(
            fc.property(objId, generation, data, (id, gen, streamData) => {
                const result = doc.replaceImageStream(id, gen, streamData, {
                    width: 100,
                    height: 100,
                    bitsPerComponent: 8,
                    colorSpace: '/DeviceRGB',
                    filter: '/FlateDecode',
                });
                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error.toLowerCase()).toContain('disposed');
                }
            }),
            { numRuns: 100 },
        );
    });

    it('after close(), writePdf returns { ok: false } with "disposed"', async () => {
        const qpdf = await createQpdfImageStreams();
        const loadResult = qpdf.loadPdf(new Uint8Array([37, 80, 68, 70]));
        expect(loadResult.ok).toBe(true);
        if (!loadResult.ok) return;

        const doc = loadResult.value;
        doc.close();

        fc.assert(
            fc.property(objId, (_id) => {
                // Use arbitrary input just to run 100 iterations
                const result = doc.writePdf();
                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error.toLowerCase()).toContain('disposed');
                }
            }),
            { numRuns: 100 },
        );
    });

    it('calling close() any number of times (1-100) does not throw', async () => {
        const qpdf = await createQpdfImageStreams();

        fc.assert(
            fc.property(closeCount, (count) => {
                const loadResult = qpdf.loadPdf(new Uint8Array([37, 80, 68, 70]));
                expect(loadResult.ok).toBe(true);
                if (!loadResult.ok) return;

                const doc = loadResult.value;

                // Call close() `count` times - should never throw
                for (let i = 0; i < count; i++) {
                    expect(() => doc.close()).not.toThrow();
                }
            }),
            { numRuns: 100 },
        );
    });
});
