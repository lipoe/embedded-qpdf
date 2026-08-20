#!/bin/bash
# Build script for compiling qpdf + wrapper to WebAssembly
# Requires: Emscripten SDK (emsdk), git
set -euo pipefail

ROOT="$PWD"
OUT_DIR="$ROOT/out"
DIST_DIR="$ROOT/dist"

EMCC_FLAGS="-Os -flto"
export CPPFLAGS="-I$OUT_DIR/include"
export LDFLAGS="-L$OUT_DIR/lib"
export PKG_CONFIG_PATH="$OUT_DIR/lib/pkgconfig"
export EM_PKG_CONFIG_PATH="$PKG_CONFIG_PATH"
export CFLAGS="$EMCC_FLAGS"
export CXXFLAGS="$CFLAGS"

mkdir -p "$OUT_DIR" "$DIST_DIR"

# --- Step 1: Build zlib for WASM ---
echo "=== Building zlib ==="
cd "$ROOT/deps/zlib"
git clean -xdf 2>/dev/null || true
emconfigure ./configure --prefix="$OUT_DIR" --static
emmake make -j$(nproc) install

# --- Step 2: Build libjpeg-turbo for WASM ---
echo "=== Building libjpeg-turbo ==="
cd "$ROOT/deps/jpeg-turbo"
git clean -xdf 2>/dev/null || true
# Apply the Emscripten BIT_BUF_SIZE patch
patch -p1 < "$ROOT/patches/jpeg-turbo-emscripten.patch"
emcmake cmake . \
  -DCMAKE_INSTALL_PREFIX="$OUT_DIR" \
  -DENABLE_SHARED=OFF \
  -DWITH_SIMD=0 \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_FLAGS="$CFLAGS"
emmake make -j$(nproc) install

# --- Step 3: Build qpdf static library for WASM ---
echo "=== Building qpdf ==="
cd "$ROOT/qpdf-src"
git clean -xdf 2>/dev/null || true
emcmake cmake -S . -B build \
  -DCMAKE_INSTALL_PREFIX="$OUT_DIR" \
  -DCMAKE_PREFIX_PATH="$OUT_DIR" \
  -DCMAKE_FIND_ROOT_PATH="$OUT_DIR" \
  -DBUILD_SHARED_LIBS=OFF \
  -DBUILD_STATIC_LIBS=ON \
  -DUSE_IMPLICIT_CRYPTO=OFF \
  -DREQUIRE_CRYPTO_NATIVE=ON \
  -DSKIP_OS_SECURE_RANDOM=OFF \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_CXX_FLAGS="$CXXFLAGS"
cmake --build build -j$(nproc)

# --- Step 4: Link wrapper + qpdf into final WASM module ---
echo "=== Building WASM module ==="
emcc \
  $LDFLAGS \
  $CPPFLAGS \
  $CFLAGS \
  $CXXFLAGS \
  --bind \
  --closure 1 \
  -s WASM_BIGINT=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s NO_DISABLE_EXCEPTION_CATCHING=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="createQpdfModule" \
  -s EXPORT_ES6=1 \
  -s EXPORTED_RUNTIME_METHODS='[]' \
  -s NO_FILESYSTEM=1 \
  -o "$DIST_DIR/qpdf-image-stream.js" \
  "$ROOT/src/wrapper.cpp" \
  "$ROOT/qpdf-src/build/libqpdf/libqpdf.a" \
  -I "$ROOT/qpdf-src/include" \
  -I "$ROOT/qpdf-src/build/libqpdf" \
  -lz \
  -ljpeg

echo "=== Build complete ==="
echo "Output: $DIST_DIR/qpdf-image-stream.js + qpdf-image-stream.wasm"
