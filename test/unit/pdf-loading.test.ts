/**
 * Unit tests for PDF loading (Requirements 2.1, 2.2, 2.3, 2.4, 2.6)
 *
 * These tests use a mock WASM module (resolved via vitest alias in vitest.config.ts)
 * to verify the TypeScript wrapper's validation logic, error handling, and correct
 * delegation to the WASM backend without requiring the actual compiled WASM binary.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createQpdfImageStreams } from '../../src/index.js';
import { mockWasm } from '../__mocks__/qpdf-image-stream.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

function loadFixture(filename: string): Uint8Array {
    return new Uint8Array(readFileSync(join(FIXTURES_DIR, filename)));
}

describe('PDF Loading', () => {
    beforeEach(() => {
        // Reset all mock functions to defaults before each test
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

    describe('Input Validation (TypeScript layer, no WASM needed)', () => {
        it('should reject non-Uint8Array input with error result', async () => {
            const qpdf = await createQpdfImageStreams();

            const result = qpdf.loadPdf('not a uint8array' as unknown as Uint8Array);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toContain('Uint8Array');
            }
        });

        it('should reject input exceeding 256 MB with size error', async () => {
            const qpdf = await createQpdfImageStreams();

            // Create a mock object that passes instanceof check but has oversized byteLength
            const fakeOversized = Object.create(Uint8Array.prototype);
            Object.defineProperty(fakeOversized, 'byteLength', {
                value: 256 * 1024 * 1024 + 1,
                writable: false,
            });

            const result = qpdf.loadPdf(fakeOversized as Uint8Array);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toContain('256 MB');
            }
        });

        it('should reject non-Uint8Array input for loadPdfWithPassword', async () => {
            const qpdf = await createQpdfImageStreams();

            const result = qpdf.loadPdfWithPassword(
                42 as unknown as Uint8Array,
                'password'
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toContain('Uint8Array');
            }
        });

        it('should reject oversized input for loadPdfWithPassword', async () => {
            const qpdf = await createQpdfImageStreams();

            const fakeOversized = Object.create(Uint8Array.prototype);
            Object.defineProperty(fakeOversized, 'byteLength', {
                value: 256 * 1024 * 1024 + 1,
                writable: false,
            });

            const result = qpdf.loadPdfWithPassword(
                fakeOversized as Uint8Array,
                'password'
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toContain('256 MB');
            }
        });
    });

    describe('Valid PDF Loading (mocked WASM)', () => {
        it('should return ok:true with a document handle for valid PDF', async () => {
            mockWasm.loadPdf = () => ({ success: true });

            const qpdf = await createQpdfImageStreams();
            const pdfData = loadFixture('simple-one-image.pdf');
            const result = qpdf.loadPdf(pdfData);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBeDefined();
                expect(typeof result.value.getImages).toBe('function');
                expect(typeof result.value.getImageStreamData).toBe('function');
                expect(typeof result.value.getRawImageStreamData).toBe('function');
                expect(typeof result.value.replaceImageStream).toBe('function');
                expect(typeof result.value.writePdf).toBe('function');
                expect(typeof result.value.close).toBe('function');
            }
        });

        it('should pass Uint8Array data to the WASM wrapper', async () => {
            let receivedData: Uint8Array | null = null;
            mockWasm.loadPdf = (data: Uint8Array) => {
                receivedData = data;
                return { success: true };
            };

            const qpdf = await createQpdfImageStreams();
            const pdfData = loadFixture('simple-one-image.pdf');
            qpdf.loadPdf(pdfData);

            expect(receivedData).toBe(pdfData);
        });

        it('should allow loading multiple PDFs independently', async () => {
            mockWasm.loadPdf = () => ({ success: true });

            const qpdf = await createQpdfImageStreams();
            const pdf1 = loadFixture('simple-one-image.pdf');
            const pdf2 = loadFixture('multi-image.pdf');

            const result1 = qpdf.loadPdf(pdf1);
            const result2 = qpdf.loadPdf(pdf2);

            expect(result1.ok).toBe(true);
            expect(result2.ok).toBe(true);

            // Each call creates a new wrapper instance (different document handles)
            if (result1.ok && result2.ok) {
                expect(result1.value).not.toBe(result2.value);
            }
        });
    });

    describe('Corrupt PDF Loading (mocked WASM)', () => {
        it('should return ok:false with error for corrupt data', async () => {
            mockWasm.loadPdf = () => ({
                success: false,
                error: 'not a PDF file',
            });

            const qpdf = await createQpdfImageStreams();
            const corruptData = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
            const result = qpdf.loadPdf(corruptData);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBe('not a PDF file');
            }
        });

        it('should return ok:false with error for random bytes', async () => {
            mockWasm.loadPdf = () => ({
                success: false,
                error: 'not a PDF file',
            });

            const qpdf = await createQpdfImageStreams();
            const randomBytes = new Uint8Array(1024);
            for (let i = 0; i < randomBytes.length; i++) {
                randomBytes[i] = Math.floor(Math.random() * 256);
            }
            const result = qpdf.loadPdf(randomBytes);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(typeof result.error).toBe('string');
                expect(result.error.length).toBeGreaterThan(0);
            }
        });

        it('should return ok:false with fallback message when WASM provides no error', async () => {
            mockWasm.loadPdf = () => ({ success: false });

            const qpdf = await createQpdfImageStreams();
            const data = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF header
            const result = qpdf.loadPdf(data);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBe('Failed to load PDF');
            }
        });

        it('should handle WASM exceptions gracefully', async () => {
            mockWasm.loadPdf = () => {
                throw new Error('WASM memory allocation failed');
            };

            const qpdf = await createQpdfImageStreams();
            const data = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
            const result = qpdf.loadPdf(data);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toContain('WASM memory allocation failed');
            }
        });
    });

    describe('Password-Protected PDF Loading (mocked WASM)', () => {
        it('should return ok:true with correct password', async () => {
            mockWasm.loadPdfWithPassword = () => ({ success: true });

            const qpdf = await createQpdfImageStreams();
            const pdfData = loadFixture('simple-one-image.pdf');
            const result = qpdf.loadPdfWithPassword(pdfData, 'correct-password');

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBeDefined();
                expect(typeof result.value.getImages).toBe('function');
                expect(typeof result.value.close).toBe('function');
            }
        });

        it('should pass Uint8Array and password to WASM wrapper', async () => {
            let receivedData: Uint8Array | null = null;
            let receivedPassword: string | null = null;
            mockWasm.loadPdfWithPassword = (data: Uint8Array, password: string) => {
                receivedData = data;
                receivedPassword = password;
                return { success: true };
            };

            const qpdf = await createQpdfImageStreams();
            const pdfData = loadFixture('simple-one-image.pdf');
            qpdf.loadPdfWithPassword(pdfData, 'my-secret');

            expect(receivedData).toBe(pdfData);
            expect(receivedPassword).toBe('my-secret');
        });

        it('should return ok:false with wrong password', async () => {
            mockWasm.loadPdfWithPassword = () => ({
                success: false,
                error: 'invalid password',
            });

            const qpdf = await createQpdfImageStreams();
            const pdfData = loadFixture('simple-one-image.pdf');
            const result = qpdf.loadPdfWithPassword(pdfData, 'wrong-password');

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toContain('invalid password');
            }
        });

        it('should return ok:false when empty password fails for encrypted PDF', async () => {
            mockWasm.loadPdfWithPassword = () => ({
                success: false,
                error: 'password required for encrypted file',
            });

            const qpdf = await createQpdfImageStreams();
            const pdfData = loadFixture('simple-one-image.pdf');
            const result = qpdf.loadPdfWithPassword(pdfData, '');

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(typeof result.error).toBe('string');
                expect(result.error.length).toBeGreaterThan(0);
            }
        });

        it('should handle WASM exception during password-protected loading', async () => {
            mockWasm.loadPdfWithPassword = () => {
                throw new Error('Decryption error');
            };

            const qpdf = await createQpdfImageStreams();
            const pdfData = loadFixture('simple-one-image.pdf');
            const result = qpdf.loadPdfWithPassword(pdfData, 'test');

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toContain('Decryption error');
            }
        });
    });

    describe('Factory Function', () => {
        it('should accept locateFile option', async () => {
            const locateFile = (name: string) => `/custom/path/${name}`;
            const qpdf = await createQpdfImageStreams({ locateFile });

            expect(typeof qpdf.loadPdf).toBe('function');
            expect(typeof qpdf.loadPdfWithPassword).toBe('function');
        });

        it('should work without any options', async () => {
            const qpdf = await createQpdfImageStreams();

            expect(typeof qpdf.loadPdf).toBe('function');
            expect(typeof qpdf.loadPdfWithPassword).toBe('function');
        });
    });
});
