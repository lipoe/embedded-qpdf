/**
 * generate-fixtures.mjs
 *
 * Generates minimal but valid PDF test fixtures for the qpdf-wasm-image-streams module.
 * Each PDF has a correct cross-reference table and trailer so that standard PDF
 * parsers (including qpdf) can process them.
 *
 * Usage: node test/fixtures/generate-fixtures.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a PDF from an array of object definitions and returns the full PDF
 * as a Buffer. Objects are numbered sequentially starting at 1.
 *
 * @param {Array<{body: Buffer|string}>} objects - Objects in order (obj 1, obj 2, ...)
 * @param {{root: number}} trailer - Trailer config (root object number)
 * @returns {Buffer}
 */
function buildPdf(objects, trailer) {
  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const offsets = [];
  let pos = header.length;

  const bodyParts = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pos);
    const objNum = i + 1;
    const objHeader = Buffer.from(`${objNum} 0 obj\n`);
    const objBody = Buffer.isBuffer(objects[i].body)
      ? objects[i].body
      : Buffer.from(objects[i].body, 'binary');
    const objFooter = Buffer.from('\nendobj\n');
    const part = Buffer.concat([objHeader, objBody, objFooter]);
    bodyParts.push(part);
    pos += part.length;
  }

  // Cross-reference table
  const xrefStart = pos;
  const xrefLines = ['xref\n', `0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (const offset of offsets) {
    xrefLines.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  }
  const xrefBuf = Buffer.from(xrefLines.join(''));

  const trailerBuf = Buffer.from(
    `trailer\n<< /Size ${objects.length + 1} /Root ${trailer.root} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  );

  return Buffer.concat([header, ...bodyParts, xrefBuf, trailerBuf]);
}

/**
 * Creates a minimal content stream that draws an image.
 * @param {string} imageName - e.g. "Im1"
 * @returns {string}
 */
function imageDrawStream(imageName) {
  return `q 100 0 0 100 50 600 cm /${imageName} Do Q`;
}

/**
 * Creates a content stream that draws text.
 * @returns {string}
 */
function textDrawStream() {
  return 'BT /F1 12 Tf 100 700 Td (Hello World) Tj ET';
}

/**
 * Wraps a string in a PDF stream object dictionary + stream keywords.
 * @param {string} content - The stream content
 * @param {string} extraDict - Additional dictionary entries (without << >>)
 * @returns {string}
 */
function streamObj(content, extraDict = '') {
  const len = Buffer.byteLength(content, 'binary');
  return `<< /Length ${len} ${extraDict}>>\nstream\n${content}\nendstream`;
}

/**
 * Creates a minimal JPEG file (2x2 pixels, grayscale).
 * This is the smallest valid JFIF that most decoders accept.
 * @returns {Buffer}
 */
function createMinimalJpeg() {
  // Minimal 2x2 grayscale JPEG
  // SOI + APP0(JFIF) + DQT + SOF0 + DHT(DC) + DHT(AC) + SOS + scan data + EOI
  const bytes = [
    // SOI
    0xFF, 0xD8,
    // APP0 - JFIF marker
    0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    // DQT - Quantization table
    0xFF, 0xDB, 0x00, 0x43, 0x00,
    // 64-byte quantization table (all 1s for simplicity)
    ...Array(64).fill(0x01),
    // SOF0 - Start of Frame (baseline, 2x2, 1 component grayscale)
    0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x02, 0x00, 0x02, 0x01, 0x01, 0x11, 0x00,
    // DHT - DC Huffman table
    0xFF, 0xC4, 0x00, 0x1F, 0x00, // class 0, id 0
    0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B,
    // DHT - AC Huffman table
    0xFF, 0xC4, 0x00, 0xB5, 0x10, // class 1, id 0
    0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
    0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08, 0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0,
    0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
    0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
    0x6A, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7,
    0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5,
    0xC6, 0xC7, 0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
    0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF8,
    0xF9, 0xFA,
    // SOS - Start of Scan
    0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7B, 0x40,
    // Minimal scan data (4 pixels of gray)
    0xFB, 0xD2, 0x8A, 0x28, 0x03,
    // EOI
    0xFF, 0xD9,
  ];
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// Fixture 1: simple-one-image.pdf
// ---------------------------------------------------------------------------
function generateSimpleOneImage() {
  // 2x2 RGB image, uncompressed. 2*2*3 = 12 bytes of pixel data.
  const pixelData = Buffer.from([
    0xFF, 0x00, 0x00,  // red
    0x00, 0xFF, 0x00,  // green
    0x00, 0x00, 0xFF,  // blue
    0xFF, 0xFF, 0x00,  // yellow
  ]);

  const contentStr = imageDrawStream('Im1');
  const contentLen = Buffer.byteLength(contentStr);

  const objects = [
    // 1: Catalog
    { body: '<< /Type /Catalog /Pages 2 0 R >>' },
    // 2: Pages
    { body: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
    // 3: Page
    { body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>' },
    // 4: Content stream
    { body: `<< /Length ${contentLen} >>\nstream\n${contentStr}\nendstream` },
    // 5: Image XObject
    { body: Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Length ${pixelData.length} >>\nstream\n`),
      pixelData,
      Buffer.from('\nendstream'),
    ]) },
  ];

  return buildPdf(objects, { root: 1 });
}

// ---------------------------------------------------------------------------
// Fixture 2: multi-image.pdf
// ---------------------------------------------------------------------------
function generateMultiImage() {
  // Page 1: Image1 (4x4 RGB) + Image2 (2x2 Gray)
  // Page 2: Image3 (3x3 RGB)
  const img1Data = Buffer.alloc(4 * 4 * 3, 0xAA); // 48 bytes
  const img2Data = Buffer.alloc(2 * 2 * 1, 0xBB); // 4 bytes
  const img3Data = Buffer.alloc(3 * 3 * 3, 0xCC); // 27 bytes

  const content1Str = `q 100 0 0 100 50 600 cm /Im1 Do Q q 50 0 0 50 200 600 cm /Im2 Do Q`;
  const content1Len = Buffer.byteLength(content1Str);

  const content2Str = imageDrawStream('Im3');
  const content2Len = Buffer.byteLength(content2Str);

  const objects = [
    // 1: Catalog
    { body: '<< /Type /Catalog /Pages 2 0 R >>' },
    // 2: Pages
    { body: '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>' },
    // 3: Page 1
    { body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /XObject << /Im1 7 0 R /Im2 8 0 R >> >> >>' },
    // 4: Page 2
    { body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /XObject << /Im3 9 0 R >> >> >>' },
    // 5: Content stream page 1
    { body: `<< /Length ${content1Len} >>\nstream\n${content1Str}\nendstream` },
    // 6: Content stream page 2
    { body: `<< /Length ${content2Len} >>\nstream\n${content2Str}\nendstream` },
    // 7: Image 1 (4x4 RGB)
    { body: Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 4 /Height 4 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Length ${img1Data.length} >>\nstream\n`),
      img1Data,
      Buffer.from('\nendstream'),
    ]) },
    // 8: Image 2 (2x2 Gray)
    { body: Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /BitsPerComponent 8 /ColorSpace /DeviceGray /Length ${img2Data.length} >>\nstream\n`),
      img2Data,
      Buffer.from('\nendstream'),
    ]) },
    // 9: Image 3 (3x3 RGB)
    { body: Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 3 /Height 3 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Length ${img3Data.length} >>\nstream\n`),
      img3Data,
      Buffer.from('\nendstream'),
    ]) },
  ];

  return buildPdf(objects, { root: 1 });
}

// ---------------------------------------------------------------------------
// Fixture 3: no-images.pdf
// ---------------------------------------------------------------------------
function generateNoImages() {
  const contentStr = textDrawStream();
  const contentLen = Buffer.byteLength(contentStr);

  const objects = [
    // 1: Catalog
    { body: '<< /Type /Catalog /Pages 2 0 R >>' },
    // 2: Pages
    { body: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
    // 3: Page
    { body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>' },
    // 4: Content stream
    { body: `<< /Length ${contentLen} >>\nstream\n${contentStr}\nendstream` },
    // 5: Font (minimal type1 font reference)
    { body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' },
  ];

  return buildPdf(objects, { root: 1 });
}

// ---------------------------------------------------------------------------
// Fixture 4: jpeg-compressed.pdf
// ---------------------------------------------------------------------------
function generateJpegCompressed() {
  const jpegData = createMinimalJpeg();

  const contentStr = imageDrawStream('Im1');
  const contentLen = Buffer.byteLength(contentStr);

  const objects = [
    // 1: Catalog
    { body: '<< /Type /Catalog /Pages 2 0 R >>' },
    // 2: Pages
    { body: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
    // 3: Page
    { body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>' },
    // 4: Content stream
    { body: `<< /Length ${contentLen} >>\nstream\n${contentStr}\nendstream` },
    // 5: Image XObject with DCTDecode
    { body: Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /BitsPerComponent 8 /ColorSpace /DeviceGray /Filter /DCTDecode /Length ${jpegData.length} >>\nstream\n`),
      jpegData,
      Buffer.from('\nendstream'),
    ]) },
  ];

  return buildPdf(objects, { root: 1 });
}

// ---------------------------------------------------------------------------
// Fixture 5: nested-forms.pdf
// ---------------------------------------------------------------------------
function generateNestedForms() {
  // Page has:
  //   - Direct image (Im1): 2x2 RGB
  //   - Form XObject (Fm1) that contains another image (Im2): 3x3 RGB
  const img1Data = Buffer.from([
    0xFF, 0x00, 0x00,
    0x00, 0xFF, 0x00,
    0x00, 0x00, 0xFF,
    0xFF, 0xFF, 0x00,
  ]);
  const img2Data = Buffer.alloc(3 * 3 * 3, 0xDD); // 27 bytes

  // Page content draws Im1 directly and places Fm1
  const pageContentStr = `q 100 0 0 100 50 600 cm /Im1 Do Q q 200 0 0 200 250 400 cm /Fm1 Do Q`;
  const pageContentLen = Buffer.byteLength(pageContentStr);

  // Form content draws Im2
  const formContentStr = `q 1 0 0 1 0 0 cm /Im2 Do Q`;
  const formContentLen = Buffer.byteLength(formContentStr);

  const objects = [
    // 1: Catalog
    { body: '<< /Type /Catalog /Pages 2 0 R >>' },
    // 2: Pages
    { body: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
    // 3: Page
    { body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R /Fm1 6 0 R >> >> >>' },
    // 4: Page content stream
    { body: `<< /Length ${pageContentLen} >>\nstream\n${pageContentStr}\nendstream` },
    // 5: Image 1 (direct on page) - 2x2 RGB
    { body: Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Length ${img1Data.length} >>\nstream\n`),
      img1Data,
      Buffer.from('\nendstream'),
    ]) },
    // 6: Form XObject containing Im2
    { body: `<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Resources << /XObject << /Im2 7 0 R >> >> /Length ${formContentLen} >>\nstream\n${formContentStr}\nendstream` },
    // 7: Image 2 (inside Form XObject) - 3x3 RGB
    { body: Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 3 /Height 3 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Length ${img2Data.length} >>\nstream\n`),
      img2Data,
      Buffer.from('\nendstream'),
    ]) },
  ];

  return buildPdf(objects, { root: 1 });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const outDir = __dirname;
mkdirSync(outDir, { recursive: true });

const fixtures = [
  { name: 'simple-one-image.pdf', generate: generateSimpleOneImage },
  { name: 'multi-image.pdf', generate: generateMultiImage },
  { name: 'no-images.pdf', generate: generateNoImages },
  { name: 'jpeg-compressed.pdf', generate: generateJpegCompressed },
  { name: 'nested-forms.pdf', generate: generateNestedForms },
];

for (const fixture of fixtures) {
  const pdf = fixture.generate();
  const path = join(outDir, fixture.name);
  writeFileSync(path, pdf);
  console.log(`Generated: ${fixture.name} (${pdf.length} bytes)`);
}

console.log('\nAll fixtures generated successfully.');
