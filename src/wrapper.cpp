/**
 * qpdf WASM Wrapper for Image Stream Manipulation
 *
 * This thin C++ wrapper exposes qpdf's library API for use from JavaScript/TypeScript
 * via Emscripten's embind. It provides the minimal surface needed to:
 *
 * 1. Load a PDF from a memory buffer
 * 2. Enumerate image XObjects (with metadata)
 * 3. Read image stream data
 * 4. Replace image stream data
 * 5. Write the modified PDF to a memory buffer
 *
 * The wrapper does NOT duplicate any PDF logic - it delegates entirely to qpdf.
 */

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <qpdf/QPDF.hh>
#include <qpdf/QPDFPageDocumentHelper.hh>
#include <qpdf/QPDFPageObjectHelper.hh>
#include <qpdf/QPDFWriter.hh>
#include <qpdf/Buffer.hh>
#include <qpdf/QIntC.hh>

#include <memory>
#include <string>
#include <vector>
#include <cstring>

using namespace emscripten;

// --- Data structures exposed to JavaScript ---

struct ImageInfo {
    int objId;
    int generation;
    int width;
    int height;
    int bitsPerComponent;
    std::string colorSpace;
    std::string filter;
    size_t streamLength;
};

struct PdfResult {
    bool success;
    std::string error;
    // For operations that return binary data, it's transferred via separate methods
};

// --- Main wrapper class ---

class QpdfWrapper {
public:
    QpdfWrapper() : qpdf_(std::make_unique<QPDF>()) {}

    /**
     * Load a PDF from a memory buffer.
     * The data is copied into qpdf's internal structures.
     */
    PdfResult loadPdf(std::string pdfData) {
        PdfResult result{true, ""};
        try {
            qpdf_ = std::make_unique<QPDF>();
            qpdf_->processMemoryFile(
                "input.pdf",
                pdfData.c_str(),
                pdfData.size(),
                nullptr  // no password
            );
        } catch (std::exception const& e) {
            result.success = false;
            result.error = e.what();
        }
        return result;
    }

    /**
     * Load an encrypted PDF from a memory buffer.
     */
    PdfResult loadPdfWithPassword(std::string pdfData, std::string password) {
        PdfResult result{true, ""};
        try {
            qpdf_ = std::make_unique<QPDF>();
            qpdf_->processMemoryFile(
                "input.pdf",
                pdfData.c_str(),
                pdfData.size(),
                password.c_str()
            );
        } catch (std::exception const& e) {
            result.success = false;
            result.error = e.what();
        }
        return result;
    }

    /**
     * Get a list of all images in the PDF with their metadata.
     * Iterates all pages and (optionally recursively) all form XObjects.
     */
    std::vector<ImageInfo> getImages(bool recursive) {
        std::vector<ImageInfo> images;
        if (!qpdf_) return images;

        try {
            QPDFPageDocumentHelper dh(*qpdf_);
            // Track already-seen objects to avoid duplicates
            std::set<QPDFObjGen> seen;

            for (auto& page : dh.getAllPages()) {
                page.forEachImage(recursive,
                    [&](QPDFObjectHandle& obj, QPDFObjectHandle&, std::string const&) {
                        QPDFObjGen og(obj);
                        if (seen.count(og)) return;
                        seen.insert(og);

                        ImageInfo info;
                        info.objId = obj.getObjectID();
                        info.generation = obj.getGeneration();

                        QPDFObjectHandle dict = obj.getDict();
                        info.width = dict.getKey("/Width").getIntValueAsInt();
                        info.height = dict.getKey("/Height").getIntValueAsInt();
                        info.bitsPerComponent = dict.getKey("/BitsPerComponent").getIntValueAsInt();

                        QPDFObjectHandle cs = dict.getKey("/ColorSpace");
                        if (cs.isName()) {
                            info.colorSpace = cs.getName();
                        } else {
                            info.colorSpace = cs.unparse();
                        }

                        QPDFObjectHandle f = dict.getKey("/Filter");
                        if (f.isName()) {
                            info.filter = f.getName();
                        } else if (f.isArray()) {
                            info.filter = f.unparse();
                        } else {
                            info.filter = "";
                        }

                        // Get raw stream length from /Length key
                        info.streamLength = static_cast<size_t>(
                            dict.getKey("/Length").getIntValue());

                        images.push_back(info);
                    }
                );
            }
        } catch (std::exception const&) {
            // Return what we have so far
        }
        return images;
    }

    /**
     * Read the decoded (uncompressed) image stream data for a given object.
     * Returns the raw pixel data as a string (binary).
     */
    std::string getImageStreamData(int objId, int generation) {
        if (!qpdf_) return "";

        try {
            QPDFObjectHandle obj = qpdf_->getObjectByID(objId, generation);
            if (!obj.isStream()) return "";

            // Decode all filters including DCT (lossy)
            std::shared_ptr<Buffer> buf = obj.getStreamData(qpdf_dl_all);
            return std::string(
                reinterpret_cast<char const*>(buf->getBuffer()),
                buf->getSize()
            );
        } catch (std::exception const&) {
            return "";
        }
    }

    /**
     * Read the raw (compressed/encoded) stream data without decoding.
     */
    std::string getRawImageStreamData(int objId, int generation) {
        if (!qpdf_) return "";

        try {
            QPDFObjectHandle obj = qpdf_->getObjectByID(objId, generation);
            if (!obj.isStream()) return "";

            std::shared_ptr<Buffer> buf = obj.getRawStreamData();
            return std::string(
                reinterpret_cast<char const*>(buf->getBuffer()),
                buf->getSize()
            );
        } catch (std::exception const&) {
            return "";
        }
    }

    /**
     * Replace an image stream with new data.
     *
     * @param objId         Object ID of the image stream
     * @param generation    Generation number
     * @param newData       New stream data (raw bytes as string)
     * @param width         New width (0 = keep existing)
     * @param height        New height (0 = keep existing)
     * @param bitsPerComponent  New BPC (0 = keep existing)
     * @param colorSpace    New color space name (empty = keep existing)
     * @param filter        New filter name (empty = no filter/raw data)
     */
    PdfResult replaceImageStream(
        int objId,
        int generation,
        std::string newData,
        int width,
        int height,
        int bitsPerComponent,
        std::string colorSpace,
        std::string filter)
    {
        PdfResult result{true, ""};
        if (!qpdf_) {
            result.success = false;
            result.error = "No PDF loaded";
            return result;
        }

        try {
            QPDFObjectHandle obj = qpdf_->getObjectByID(objId, generation);
            if (!obj.isStream()) {
                result.success = false;
                result.error = "Object is not a stream";
                return result;
            }

            // Create Buffer from the new data
            auto buf = std::make_shared<Buffer>(newData.size());
            std::memcpy(buf->getBuffer(), newData.data(), newData.size());

            // Determine filter and decode_parms for replaceStreamData
            QPDFObjectHandle filterObj;
            QPDFObjectHandle decodeParms = QPDFObjectHandle::newNull();

            if (filter.empty()) {
                // No filter - raw uncompressed data
                filterObj = QPDFObjectHandle::newNull();
            } else {
                filterObj = QPDFObjectHandle::newName(filter);
            }

            // Replace the stream data
            obj.replaceStreamData(buf, filterObj, decodeParms);

            // Update the stream dictionary metadata
            QPDFObjectHandle dict = obj.getDict();
            if (width > 0) {
                dict.replaceKey("/Width", QPDFObjectHandle::newInteger(width));
            }
            if (height > 0) {
                dict.replaceKey("/Height", QPDFObjectHandle::newInteger(height));
            }
            if (bitsPerComponent > 0) {
                dict.replaceKey("/BitsPerComponent",
                    QPDFObjectHandle::newInteger(bitsPerComponent));
            }
            if (!colorSpace.empty()) {
                dict.replaceKey("/ColorSpace",
                    QPDFObjectHandle::newName(colorSpace));
            }

        } catch (std::exception const& e) {
            result.success = false;
            result.error = e.what();
        }
        return result;
    }

    /**
     * Write the (modified) PDF to a memory buffer and return it.
     */
    std::string writePdf() {
        if (!qpdf_) return "";

        try {
            QPDFWriter writer(*qpdf_);
            writer.setOutputMemory();
            // Don't try to recompress streams we've already set up
            writer.setCompressStreams(true);
            writer.setDecodeLevel(qpdf_dl_none);
            writer.write();

            std::shared_ptr<Buffer> buf = writer.getBufferSharedPointer();
            return std::string(
                reinterpret_cast<char const*>(buf->getBuffer()),
                buf->getSize()
            );
        } catch (std::exception const&) {
            return "";
        }
    }

    /**
     * Get the number of pages in the loaded PDF.
     */
    int getPageCount() {
        if (!qpdf_) return 0;
        try {
            return static_cast<int>(
                QPDFPageDocumentHelper(*qpdf_).getAllPages().size());
        } catch (std::exception const&) {
            return 0;
        }
    }

private:
    std::unique_ptr<QPDF> qpdf_;
};

// --- Embind bindings ---

EMSCRIPTEN_BINDINGS(qpdf_wrapper) {
    value_object<ImageInfo>("ImageInfo")
        .field("objId", &ImageInfo::objId)
        .field("generation", &ImageInfo::generation)
        .field("width", &ImageInfo::width)
        .field("height", &ImageInfo::height)
        .field("bitsPerComponent", &ImageInfo::bitsPerComponent)
        .field("colorSpace", &ImageInfo::colorSpace)
        .field("filter", &ImageInfo::filter)
        .field("streamLength", &ImageInfo::streamLength);

    value_object<PdfResult>("PdfResult")
        .field("success", &PdfResult::success)
        .field("error", &PdfResult::error);

    register_vector<ImageInfo>("VectorImageInfo");

    class_<QpdfWrapper>("QpdfWrapper")
        .constructor<>()
        .function("loadPdf", &QpdfWrapper::loadPdf)
        .function("loadPdfWithPassword", &QpdfWrapper::loadPdfWithPassword)
        .function("getImages", &QpdfWrapper::getImages)
        .function("getImageStreamData", &QpdfWrapper::getImageStreamData)
        .function("getRawImageStreamData", &QpdfWrapper::getRawImageStreamData)
        .function("replaceImageStream", &QpdfWrapper::replaceImageStream)
        .function("writePdf", &QpdfWrapper::writePdf)
        .function("getPageCount", &QpdfWrapper::getPageCount);
}
