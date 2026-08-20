# Gap-Analyse und Bewertung bestehender Implementierungen

## 1. Bestehende qpdf-WASM-Implementierungen

### 1.1 @neslinesli93/qpdf-wasm

| Kriterium | Bewertung |
|---|---|
| **Repository** | https://github.com/neslinesli93/qpdf-wasm |
| **npm-Paket** | `@neslinesli93/qpdf-wasm` (v0.3.0) |
| **qpdf-Version** | 12.2.0 |
| **Aktiv gepflegt?** | Mäßig – letztes Release 2025, 3 Releases gesamt, 37 Stars |
| **Browserfähig?** | ✅ Ja |
| **Memory-Input/Output?** | ⚠️ Nur über Emscripten Virtual FS (FS.writeFile / FS.readFile) |
| **Zugriff auf Image Streams?** | ❌ Nein |
| **Ersetzen von Image Streams?** | ❌ Nein |
| **API-Art** | Nur CLI (`callMain`) |
| **Abstraktionsschicht** | Keine – direkter CLI-Aufruf |

**Was kann es:**
- qpdf-CLI im Browser ausführen (callMain)
- PDFs über Virtual-FS laden und speichern
- Alle qpdf-CLI-Operationen (Seitenextraktion, Linearisierung, Verschlüsselung, etc.)

**Was fehlt für unseren Use-Case:**
- Kein Zugriff auf die qpdf-Library-API
- Kein Zugriff auf QPDFObjectHandle, Streams, Dictionaries
- Kein Image-Stream-Lesen oder -Ersetzen
- Kein programmatischer Zugriff auf PDF-Objekte
- Die CLI bietet keine Möglichkeit, einzelne Streams durch externe Daten zu ersetzen

**Kann man es verwenden/erweitern?**
- Der **Build-Prozess** (Dockerfile, build.sh) ist direkt übernehmbar
- Das **WASM-Binary** (libqpdf.a) ist wiederverwendbar
- Die **Binding-Schicht** müsste komplett ersetzt werden (callMain → Embind)

---

### 1.2 @jspawn/qpdf-wasm

| Kriterium | Bewertung |
|---|---|
| **Repository** | https://github.com/jsscheller/qpdf-wasm |
| **npm-Paket** | `@jspawn/qpdf-wasm` |
| **qpdf-Version** | Ältere Version (veröffentlicht Juli 2022) |
| **Aktiv gepflegt?** | ❌ Nein – 6 Commits, letzte Aktivität 2022 |
| **Browserfähig?** | ✅ Ja |
| **Memory-Input/Output?** | ⚠️ Nur über Virtual FS |
| **Zugriff auf Image Streams?** | ❌ Nein |
| **Ersetzen von Image Streams?** | ❌ Nein |
| **API-Art** | Nur CLI |
| **Abstraktionsschicht** | Keine |

**Bewertung:** Veraltet, inaktiv, nur CLI. Nicht nutzbar für unseren Use-Case.

---

### 1.3 le0pard/qpdf-wasm (QPDF WASM PDF Optimizer)

| Kriterium | Bewertung |
|---|---|
| **Repository** | Veröffentlicht Mai 2026, SvelteKit-basiert |
| **qpdf-Version** | Aktuell (basiert vermutlich auf neslinesli93/qpdf-wasm) |
| **Aktiv gepflegt?** | Ja (2026) |
| **Browserfähig?** | ✅ Ja (Web Workers + Comlink) |
| **Zugriff auf Image Streams?** | ❌ Nein |
| **API-Art** | CLI-basiert (optimize, compress, decrypt) |

**Bewertung:** Nutzt qpdf-wasm als CLI-Tool in einer SvelteKit-App. Kein API-Zugriff auf PDF-Objekte. Für unseren Use-Case nicht relevant, zeigt aber Web-Worker-Integration.

---

### 1.4 henrixapp/pdfcomprezzor (Go/pdfcpu)

| Kriterium | Bewertung |
|---|---|
| **Sprache** | Go (WASM) |
| **PDF-Library** | pdfcpu (nicht qpdf) |
| **Zugriff auf Image Streams?** | ✅ Ja – dekodiert, komprimiert, ersetzt Bilder |
| **Aktiv gepflegt?** | ❌ Nein (2020-2022) |

**Bewertung:** Konzeptionell ähnlich (Images in PDF ersetzen), aber andere Technologie (Go/pdfcpu statt C++/qpdf). Nicht direkt nutzbar, aber bestätigt den Ansatz.

---

## 2. Zusammenfassung: Bestehende Lösungen vs. unser Use-Case

| Anforderung | neslinesli93 | jspawn | le0pard | Unser Wrapper |
|---|---|---|---|---|
| qpdf im Browser | ✅ | ✅ | ✅ | ✅ |
| PDF aus Uint8Array laden | ⚠️ FS | ⚠️ FS | ⚠️ FS | ✅ direkt |
| PDF-Objekte traversieren | ❌ | ❌ | ❌ | ✅ |
| Image-XObjects finden | ❌ | ❌ | ❌ | ✅ |
| Image Streams auslesen | ❌ | ❌ | ❌ | ✅ |
| Image Streams ersetzen | ❌ | ❌ | ❌ | ✅ |
| Stream-Metadaten ändern | ❌ | ❌ | ❌ | ✅ |
| PDF als Uint8Array zurück | ⚠️ FS | ⚠️ FS | ⚠️ FS | ✅ direkt |

**Ergebnis: Keine bestehende Implementierung deckt unseren Use-Case ab.**

Alle existierenden qpdf-WASM-Projekte exponieren ausschließlich die CLI (`callMain`). Keines bietet programmatischen Zugriff auf die qpdf-Library-API, PDF-Objekte oder Streams.

---

## 3. Was ist vom bestehenden @neslinesli93/qpdf-wasm übernehmbar?

| Komponente | Übernehmbar? | Wie? |
|---|---|---|
| Dockerfile (Build-Umgebung) | ✅ Ja | Direkt als Basis verwenden |
| build.sh (Kompilierungs-Ablauf) | ✅ Ja | Anpassen (Embind statt CLI) |
| zlib/jpeg-turbo Dependency-Build | ✅ Ja | 1:1 übernehmen |
| jpeg-turbo Patch | ✅ Ja | Identisch |
| qpdf CMake-Invocation | ⚠️ Teilweise | Flags anpassen |
| Final emcc Link-Schritt | ❌ Nein | Komplett anders (--bind statt CLI) |
| JS/TS Wrapper | ❌ Nein | Nicht vorhanden (nur callMain) |

---

## 4. Status der aktuell erstellten Dateien

| Datei | Status | Produktionsnähe |
|---|---|---|
| `EVALUATION.md` | Dokumentation | ✅ Fertig |
| `build-wasm.sh` | PoC | ⚠️ ~80% – Pfade und Flags korrekt, nicht getestet |
| `patches/jpeg-turbo-emscripten.patch` | Produktionsnah | ✅ Identisch mit bewiesenem Patch |
| `src/wrapper.cpp` | PoC | ⚠️ ~70% – Struktur korrekt, Embind-String-Transfer suboptimal für große Binärdaten |
| `src/types.d.ts` | PoC | ⚠️ ~60% – Basis-Typen, aber kein Uint8Array-Support |
| `qpdf-src/` | Referenz | ✅ Originaler qpdf-Quellcode |

---

## 5. Was fehlt bis zur nutzbaren Browser-Implementierung?

### 5.1 Build-Infrastruktur

| Was fehlt | Zwingend? | Aufwand |
|---|---|---|
| Docker-basierte Build-Umgebung (Dockerfile) | ✅ Ja | 1-2h (von neslinesli93 adaptieren) |
| CI/CD Pipeline für automatisierten Build | Nein (Optimierung) | 2-4h |
| Reproduzierbares Build mit festen Dependency-Versionen | ✅ Ja | 1h |

### 5.2 WASM-Binding (C++ Wrapper)

| Was fehlt | Zwingend? | Aufwand |
|---|---|---|
| Uint8Array-Transfer statt std::string für große Binärdaten | ✅ Ja | 2-3h |
| Proper Error-Handling mit strukturierten Fehlerobjekten | ✅ Ja | 1-2h |
| Memory-Management (explizites Freigeben von Objekten) | ✅ Ja | 1-2h |
| Streaming-Support für sehr große PDFs | Nein (Optimierung) | 4-8h |
| Web-Worker-Kompatibilität prüfen | ✅ Ja | 1-2h |

### 5.3 TypeScript-Wrapper

| Was fehlt | Zwingend? | Aufwand |
|---|---|---|
| Async-Wrapper mit WASM-Modul-Initialisierung | ✅ Ja | 2-3h |
| Uint8Array-basierte API (nicht string-basiert) | ✅ Ja | 2-3h |
| Ergonomische High-Level-API (`replaceImageStreams()`) | ✅ Ja | 3-4h |
| Error-Handling und Validierung | ✅ Ja | 1-2h |
| JSDoc/TSDoc Dokumentation | Nein (Optimierung) | 2h |

### 5.4 Browser-Integration

| Was fehlt | Zwingend? | Aufwand |
|---|---|---|
| WASM-Modul laden und initialisieren | ✅ Ja | 1h |
| Web-Worker-Integration für Non-Blocking | Empfohlen | 3-4h |
| Bundler-Konfiguration (Webpack/Vite) | ✅ Ja | 1-2h |
| WASM-Datei-Serving/CDN-Strategie | ✅ Ja | 1h |

### 5.5 Tests

| Was fehlt | Zwingend? | Aufwand |
|---|---|---|
| Unit-Tests für C++ Wrapper (native, nicht WASM) | Empfohlen | 2-3h |
| Integration-Tests im Browser (WASM) | ✅ Ja | 3-4h |
| Test-PDFs mit verschiedenen Image-Typen | ✅ Ja | 1-2h |
| Performance-Tests mit großen PDFs | Nein (Optimierung) | 2-3h |

### 5.6 Zusammenfassung Aufwand

| Kategorie | Zwingend | Optimierung |
|---|---|---|
| Build | ~4h | ~4h |
| C++ Wrapper | ~7h | ~8h |
| TypeScript | ~9h | ~2h |
| Browser | ~4h | ~4h |
| Tests | ~6h | ~5h |
| **Gesamt** | **~30h** | **~23h** |

---

## 6. Konkrete Probleme im aktuellen PoC-Wrapper

### Problem 1: String-basierter Binärtransfer

Der aktuelle Wrapper nutzt `std::string` für PDF- und Bilddaten. Das ist für Embind funktional, aber:
- Ineffizient für große Binärdaten (String-Encoding-Overhead)
- Extra Kopien durch String↔ArrayBuffer Konvertierung
- Embind-Strings sind UTF-8, Binärdaten können kaputt gehen

**Lösung:** `emscripten::val` mit `typed_memory_view` oder eine explizite Pointer+Length-API:

```cpp
// Statt:
std::string getImageStreamData(int objId, int gen);

// Besser:
emscripten::val getImageStreamData(int objId, int gen) {
    auto buf = obj.getStreamData(qpdf_dl_all);
    return emscripten::val(
        emscripten::typed_memory_view(buf->getSize(), buf->getBuffer())
    );
}
```

### Problem 2: Keine Objekt-Lifetime-Kontrolle

Der Wrapper erstellt intern einen `QPDF`-Pointer, aber gibt JS keinen expliziten Destruktor.

**Lösung:** Embind `.destructor()` oder explizite `close()`-Methode.

### Problem 3: Kein Web-Worker-Support

Große PDFs blockieren den Main-Thread.

**Lösung:** WASM-Modul in Worker laden, Comlink oder postMessage für Kommunikation.

---

## 7. Empfehlung

### Empfehlung: **Option C** – Vorhandenen WASM-Build übernehmen und eigenen Wrapper behalten

**Begründung:**

1. **Kein bestehendes Projekt deckt unseren Use-Case ab.** Alle existierenden qpdf-WASM-Implementierungen exponieren nur die CLI. Keine bietet Library-API-Zugriff.

2. **Der Build-Prozess ist gelöst.** Das neslinesli93/qpdf-wasm Projekt liefert ein bewiesenes Dockerfile und build.sh, das wir als Grundlage übernehmen können. Dies spart den aufwändigsten Teil (Build-Konfiguration, Dependency-Handling, Patch-Management).

3. **Unser eigener Wrapper ist zwingend notwendig.** Die Embind-Binding-Schicht für Library-API-Zugriff existiert nirgends und muss von uns erstellt werden. Dies ist der eigentliche Kern unserer Arbeit.

4. **Fork ist nicht sinnvoll.** Das neslinesli93-Projekt hat eine fundamental andere Architektur (CLI-Exposition vs. Library-API). Ein Fork würde mehr Aufräumarbeit als Nutzen bringen.

### Konkret übernehmen:

| Von neslinesli93/qpdf-wasm | Aktion |
|---|---|
| Dockerfile-Struktur | Als Basis für eigenes Dockerfile |
| Dependency-Build (zlib, jpeg-turbo) | 1:1 übernehmen |
| jpeg-turbo Patch | 1:1 übernehmen |
| qpdf cmake Invocation | Adaptieren (Flags anpassen) |
| emcc Link-Schritt | **Ersetzen** (--bind + unser Wrapper) |

### Selbst implementieren:

| Komponente | Status |
|---|---|
| C++ Wrapper mit Embind | PoC vorhanden, ~30% Überarbeitung nötig |
| TypeScript High-Level API | Neu erstellen |
| Web-Worker-Integration | Neu erstellen |
| Tests | Neu erstellen |

### Nicht übernehmen:

| Komponente | Grund |
|---|---|
| callMain-Architektur | Falscher Ansatz für Library-Zugriff |
| Virtual-FS-basierter I/O | Unnötig bei processMemoryFile |
| NODEFS/WORKERFS Exports | Nicht benötigt |

---

## 8. Empfohlener nächster Schritt

1. **Dockerfile erstellen** basierend auf neslinesli93/qpdf-wasm, aber mit:
   - Eigener emcc-Link-Schritt (--bind statt CLI)
   - Unserem wrapper.cpp
   - NO_FILESYSTEM=1 (kein Virtual FS)

2. **wrapper.cpp überarbeiten:**
   - `emscripten::val` + `typed_memory_view` für Binärdaten
   - Explizite Lifetime-Kontrolle
   - Fehlerbehandlung

3. **Erstes WASM-Binary bauen und im Browser testen:**
   - Minimal-Test: PDF laden → Image-Liste ausgeben

4. **TypeScript-Wrapper mit Uint8Array-API erstellen**

5. **Integration-Test: Image ersetzen und PDF zurückschreiben**
