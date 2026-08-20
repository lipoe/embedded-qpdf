/**
 * Property-Based Test: PDF Load/Write Round Trip (Property 1)
 *
 * **Validates: Requirements 6.2, 6.3**
 *
 * Property: For any valid PDF data (represented as arbitrary Uint8Array of
 * reasonable size), loadPdf → writePdf produces a non-empty Uint8Array output
 * that starts with %PDF.
 *
 * Since the WASM module is mocked, these tests validate the TypeScript wrapper's
 * contract: that the load→write pipeline correctly passes data through,
 * copies typed_memory_view output, and returns a well-formed Result type.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { createQpdfImageStreams } from '../../src/index.js';
import { mockWasm } from '../__mocks__/qpdf-image-stream.js';

/** %PDF magic bytes */
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

describe('Property 1: PDF Load/Write Round Trip', () => {
    beforeEach(() => {
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

    it('for any valid PDF payload, loadPdf → writePdf produces a non-empty Uint8Array starting with %PDF', async () => {
        // Configure mock: loadPdf always succeeds, writePdf returns a PDF-like output
        mockWasm.loadPdf = () => ({ success: true });
        mockWasm.writePdf = () => {
            // Simulate realistic writePdf output: %PDF header + some content
            const header = PDF_MAGIC;
            const body = new Uint8Array(64);
            body.set(header, 0);
            return body;
        };

        const qpdf = await createQpdfImageStreams();

        fc.assert(
            fc.property(
                // Generate arbitrary Uint8Array payloads (1 to 1000 bytes)
                fc.uint8Array({ minLength: 1, maxLength: 1000 }),
                (pdfPayload) => {
                    // Load the PDF
                    const loadResult = qpdf.loadPdf(pdfPayload);
                    expect(loadResult.ok).toBe(true);
                    if (!loadResult.ok) return;

                    // Write without modifications
                    const writeResult = loadResult.value.writePdf();
                    expect(writeResult.ok).toBe(true);
                    if (!writeResult.ok) return;

                    // Assert output is a non-empty Uint8Array
                    expect(writeResult.value).toBeInstanceOf(Uint8Array);
                    expect(writeResult.value.byteLength).toBeGreaterThan(0);

                    // Assert output starts with %PDF magic bytes
                    expect(writeResult.value[0]).toBe(0x25); // %
                    expect(writeResult.value[1]).toBe(0x50); // P
                    expect(writeResult.value[2]).toBe(0x44); // D
                    expect(writeResult.value[3]).toBe(0x46); // F

                    // Clean up
                    loadResult.value.close();
                }
            ),
            { numRuns: 100 }
        );
    });

    it('for any loaded PDF, calling writePdf twice produces equal results (deterministic output)', async () => {
        // Configure mock: writePdf returns deterministic output based on internal state
        mockWasm.loadPdf = () => ({ success: true });

        // Use a consistent output for each wrapper instance
        const pdfOutput = new Uint8Array(128);
        pdfOutput.set(PDF_MAGIC, 0);
        // Fill with deterministic content
        for (let i = 4; i < pdfOutput.length; i++) {
            pdfOutput[i] = (i * 7 + 3) & 0xff;
        }
        mockWasm.writePdf = () => pdfOutput;

        const qpdf = await createQpdfImageStreams();

        fc.assert(
            fc.property(
                fc.uint8Array({ minLength: 1, maxLength: 1000 }),
                (pdfPayload) => {
                    const loadResult = qpdf.loadPdf(pdfPayload);
                    expect(loadResult.ok).toBe(true);
                    if (!loadResult.ok) return;

                    // Write twice
                    const write1 = loadResult.value.writePdf();
                    const write2 = loadResult.value.writePdf();

                    expect(write1.ok).toBe(true);
                    expect(write2.ok).toBe(true);
                    if (!write1.ok || !write2.ok) return;

                    // Both outputs should be equal
                    expect(write1.value).toEqual(write2.value);
                    expect(write1.value.byteLength).toBe(write2.value.byteLength);

                    // Each should be an independent copy (not the same reference)
                    expect(write1.value).not.toBe(write2.value);

                    // Clean up
                    loadResult.value.close();
                }
            ),
            { numRuns: 100 }
        );
    });
});
