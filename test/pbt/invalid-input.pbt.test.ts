/**
 * Property-based tests for invalid input rejection.
 *
 * **Validates: Requirements 11.5**
 *
 * Properties tested:
 * 1. Any non-Uint8Array value passed to loadPdf returns { ok: false } with error mentioning "Uint8Array"
 * 2. Any non-Uint8Array value passed to loadPdfWithPassword returns { ok: false }
 * 3. For replaceImageStream, non-Uint8Array data returns { ok: false }
 * 4. Oversized inputs (>256 MB) are rejected
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { mockWasm } from '../__mocks__/qpdf-image-stream.js';
import { createQpdfImageStreams } from '../../src/index.js';

/** Generator for values that are NOT Uint8Array instances */
const nonUint8Array = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.constant(null),
    fc.constant(undefined),
    fc.array(fc.integer()),
    fc.record({ buffer: fc.constant(new ArrayBuffer(10)) }),
);

describe('Property 5: Invalid Input Rejection', () => {
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

    it('loadPdf rejects any non-Uint8Array input with { ok: false } and error mentioning "Uint8Array"', async () => {
        const qpdf = await createQpdfImageStreams();

        fc.assert(
            fc.property(nonUint8Array, (input) => {
                const result = qpdf.loadPdf(input as unknown as Uint8Array);
                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error).toContain('Uint8Array');
                }
            }),
            { numRuns: 100 },
        );
    });

    it('loadPdfWithPassword rejects any non-Uint8Array input with { ok: false }', async () => {
        const qpdf = await createQpdfImageStreams();

        fc.assert(
            fc.property(nonUint8Array, fc.string(), (input, password) => {
                const result = qpdf.loadPdfWithPassword(
                    input as unknown as Uint8Array,
                    password,
                );
                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error).toContain('Uint8Array');
                }
            }),
            { numRuns: 100 },
        );
    });

    it('replaceImageStream rejects non-Uint8Array data with { ok: false }', async () => {
        // Set up a loaded document so we can test replaceImageStream
        mockWasm.loadPdf = () => ({ success: true });

        const qpdf = await createQpdfImageStreams();
        const loadResult = qpdf.loadPdf(new Uint8Array([37, 80, 68, 70]));
        expect(loadResult.ok).toBe(true);
        if (!loadResult.ok) return;

        const doc = loadResult.value;

        fc.assert(
            fc.property(nonUint8Array, (input) => {
                const result = doc.replaceImageStream(
                    5,
                    0,
                    input as unknown as Uint8Array,
                    { width: 100, height: 100, bitsPerComponent: 8, colorSpace: '/DeviceRGB', filter: '/FlateDecode' },
                );
                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error).toContain('Uint8Array');
                }
            }),
            { numRuns: 100 },
        );
    });

    it('loadPdf rejects oversized inputs (>256 MB)', async () => {
        const qpdf = await createQpdfImageStreams();

        // Create a mock Uint8Array-like object with byteLength > 256*1024*1024
        const oversized = Object.create(Uint8Array.prototype);
        Object.defineProperty(oversized, 'byteLength', {
            value: 256 * 1024 * 1024 + 1,
            writable: false,
        });

        const result = qpdf.loadPdf(oversized as Uint8Array);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain('256 MB');
        }
    });

    it('loadPdfWithPassword rejects oversized inputs (>256 MB)', async () => {
        const qpdf = await createQpdfImageStreams();

        const oversized = Object.create(Uint8Array.prototype);
        Object.defineProperty(oversized, 'byteLength', {
            value: 256 * 1024 * 1024 + 1,
            writable: false,
        });

        const result = qpdf.loadPdfWithPassword(oversized as Uint8Array, 'password');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain('256 MB');
        }
    });
});
