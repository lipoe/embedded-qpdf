# Build environment for qpdf WASM image streams module
# Usage: docker build -t qpdf-wasm-builder . && docker run --rm -v $(pwd)/dist:/out qpdf-wasm-builder
FROM emscripten/emsdk:3.1.74

# Install required build tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        cmake \
        make \
        patch \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /build

# Copy source tree into container
COPY build-wasm.sh ./
COPY patches/ ./patches/
COPY qpdf-src/ ./qpdf-src/
COPY src/ ./src/

# deps/ is added by task 1.3; COPY will fail early with a clear message
# if it doesn't exist yet, satisfying requirement 1.9
COPY deps/ ./deps/

# Make build script executable
RUN chmod +x build-wasm.sh

# Entry point: run the build, then copy artifacts to /out volume mount.
# The script exits non-zero on any compilation failure (set -euo pipefail),
# satisfying requirements 1.7 and 1.9.
ENTRYPOINT ["/bin/bash", "-c", "\
    ./build-wasm.sh && \
    mkdir -p /out && \
    cp dist/qpdf-image-stream.js /out/ && \
    cp dist/qpdf-image-stream.wasm /out/ && \
    echo '=== Artifacts copied to /out ===' \
"]
