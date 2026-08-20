/**
 * TypeScript type definitions for the qpdf WASM wrapper.
 * These types correspond to the C++ structs and classes exposed via Embind.
 */

export interface ImageInfo {
    objId: number;
    generation: number;
    width: number;
    height: number;
    bitsPerComponent: number;
    colorSpace: string;
    filter: string;
    streamLength: number;
}

export interface PdfResult {
    success: boolean;
    error: string;
}

export interface QpdfWrapper {
    loadPdf(data: string): PdfResult;
    loadPdfWithPassword(data: string, password: string): PdfResult;
    getImages(recursive: boolean): ImageInfo[];
    getImageStreamData(objId: number, generation: number): string;
    getRawImageStreamData(objId: number, generation: number): string;
    replaceImageStream(
        objId: number,
        generation: number,
        newData: string,
        width: number,
        height: number,
        bitsPerComponent: number,
        colorSpace: string,
        filter: string
    ): PdfResult;
    writePdf(): string;
    getPageCount(): number;
}

export interface QpdfModule {
    QpdfWrapper: { new(): QpdfWrapper };
}

export type CreateModuleFunction = (options?: {
    locateFile?: (filename: string) => string;
}) => Promise<QpdfModule>;

declare const createQpdfModule: CreateModuleFunction;
export default createQpdfModule;
