import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
    resolve: {
        alias: {
            './qpdf-image-stream.js': resolve(__dirname, 'test/__mocks__/qpdf-image-stream.js'),
        },
    },
    test: {
        include: ['test/**/*.test.ts'],
        globals: false,
    },
});
