/**
 * Property-based tests for image stream read round trip.
 *
 * **Validates: Requirements 4.1, 5.1, 6.1**
 *
 * Properties verified:
 * 1. For any positive objId and non-negative generation, getImageStreamData returns
 *    { ok: true, value: Uint8Array } when WASM returns data
 * 2. For any positive objId and non-negative generation, getRawImageStreamData returns
 *    { ok: true, value: Uint8Array } when WASM returns data
 * 3. The returned Uint8Array is a COPY (not the same reference as what mock returns)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { createQpdfImageStreams } from '../../src/index.js';
import { mockWasm } from '../__mocks__/qpdf-image-stream.js';

// Generators
const validObjId = fc.integer({ min: 1, max: 10000 });
const validGeneration = fc.integer({ min: 0, max: 100 });

describe('Property: Image Stream Read Round Trip', () => {
    beforeEach(() => {
        // Reset mocks
        mockWasm.loadPdf = null;
        mockWasm.loadPdfWithPassword = null;
        mockWasm.getImages = null;
        mockWasm.getImageStreamData = null;
        mockWasm.getRawImageStreamData = null;
        mockWasm.replaceImageStream = null;
        mockWasm.writePdf = null;
        mockWasm.close = null;
        mockWasm.getPageCount = null;

        // Configure mocks to return known data for stream reads
        mockWasm.getImageStreamData = () => new Uint8Array([10, 20, 30, 40]);
        mockWasm.getRawImageStreamData = () => new Uint8Array([50, 60, 70, 80]);
    });

    it('getImageStreamData returns { ok: true, value: Uint8Array } for any valid objId and generation', async () => {
        const qpdf = await createQpdfImageStreams();
        const loadResult = qpdf.loadPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
        expect(loadResult.ok).toBe(true);
        if (!loadResult.ok) return;

        const doc = loadResult.value;

        fc.assert(
            fc.property(validObjId, validGeneration, (objId, gen) => {
                const result = doc.getImageStreamData(objId, gen);

                expect(result.ok).toBe(true);
                if (!result.ok) return;

                expect(result.value).toBeInstanceOf(Uint8Array);
                expect(result.value.length).toBeGreaterThan(0);
            }),
            { numRuns: 100 }
        );

        doc.close();
    });

    it('getRawImageStreamData returns { ok: true, value: Uint8Array } for any valid objId and generation', async () => {
        const qpdf = await createQpdfImageStreams();
        const loadResult = qpdf.loadPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
        expect(loadResult.ok).toBe(true);
        if (!loadResult.ok) return;

        const doc = loadResult.value;

        fc.assert(
            fc.property(validObjId, validGeneration, (objId, gen) => {
                const result = doc.getRawImageStreamData(objId, gen);

                expect(result.ok).toBe(true);
                if (!result.ok) return;

                expect(result.value).toBeInstanceOf(Uint8Array);
                expect(result.value.length).toBeGreaterThan(0);
            }),
            { numRuns: 100 }
        );

        doc.close();
    });

    it('returned Uint8Array is a copy, not the same reference as mock data', async () => {
        const qpdf = await createQpdfImageStreams();
        const loadResult = qpdf.loadPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
        expect(loadResult.ok).toBe(true);
        if (!loadResult.ok) return;

        const doc = loadResult.value;

        fc.assert(
            fc.property(validObjId, validGeneration, (objId, gen) => {
                // Capture the exact array the mock will return
                const mockDecodedData = new Uint8Array([10, 20, 30, 40]);
                mockWasm.getImageStreamData = () => mockDecodedData;

                const decodedResult = doc.getImageStreamData(objId, gen);
                expect(decodedResult.ok).toBe(true);
                if (!decodedResult.ok) return;

                // Must NOT be the same reference (it should be a copy)
                expect(decodedResult.value).not.toBe(mockDecodedData);
                // But must have the same content
                expect(decodedResult.value).toEqual(mockDecodedData);

                // Capture the exact array the mock will return for raw
                const mockRawData = new Uint8Array([50, 60, 70, 80]);
                mockWasm.getRawImageStreamData = () => mockRawData;

                const rawResult = doc.getRawImageStreamData(objId, gen);
                expect(rawResult.ok).toBe(true);
                if (!rawResult.ok) return;

                // Must NOT be the same reference (it should be a copy)
                expect(rawResult.value).not.toBe(mockRawData);
                // But must have the same content
                expect(rawResult.value).toEqual(mockRawData);
            }),
            { numRuns: 100 }
        );

        doc.close();
    });
});
