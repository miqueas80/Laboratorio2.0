# NEXUS-X · Edge Architecture (experimental)

Branch: `feature/nexus-x-edge-architecture-v1`

**No production data is mutated by importing these modules.** The current app, its
111 inventory records, 6 documents, Vosk ASR, QR and xKiro gateway stay unchanged.
Do not merge this branch into the expo release solely on green unit tests.

## Implemented, isolated and testable

- `search-core.js`, `search-worker.js`, `search-client.js`: indexed local
  BM25 plus cosine when supplied valid offline vectors. Query runs in a Worker;
  supports up to 150k documents per index subject to actual device capacity.
- `virtual-list.js`: fixed-height viewport DOM virtualizer.
- `storage.js`: separate IndexedDB V1 store, receipt-based **copy-only**
  inventory migration with dry-run default; native atomic transactions; OPFS
  attachment functions. Original app's data is never deleted.
- `chemical-engine.js`: validates CAS check digits and SDS-sourced GHS fields,
  checks a small explicit incompatibility rule set. Unverified records remain
  unknown, not assumed safe.
- `agent-dag.js`: topology and cycle validation, reads + staged writes committed
  in one atomic DB transaction; refuses irreversible UI/remote writes.
- `sync-core.js`: prototype LWW register CRDT with deterministic merges and
  tombstones. **Not** WebRTC transport or full Yjs/Automerge collaboration.
- `lens-preprocess-worker.js`: opt-in ImageBitmap + OffscreenCanvas preprocessing.
- `voice-guard.js`: opt-in energy detection hook; **not** a trained keyword spotter.
- `telemetry.js`: bounded, redacted, local structured diagnostics.

## Pending before claiming the full requested specification

1. Choose, license, quantize, package and benchmark a **Spanish/multilingual**
   text embedding model compatible with Android WebGPU/WASM. This branch uses
   cosine vectors supplied by a caller, but does not generate text embeddings.
2. HNSW index and BM25 score calibration, 100,000+ record stress tests on the
   target smartphone, 60 FPS profiling and the requested less-than-80 MB DOM
   memory budget. Neither FPS nor RAM target has been verified.
3. Actual Dexie adapter and verified OPFS migration for the 6 production documents.
4. A professionally curated SDS/CAS reference and expert review before storage
   incompatibility warnings may be treated as safety decisions.
5. Couple the DAG only to reversible local tools and a permissioned event system;
   arbitrary UI actions cannot be rolled back.
6. An encrypted, authenticated LAN signaling/pairing channel for Yjs/Automerge
   transport. WebRTC peers need signaling, even on a LAN without Internet.
7. Physical Android offline, voice TTS, QR, model-cache and SW regression tests,
   plus a backup/rollback drill and formal release authorization.

Run `npm test` (includes `next-edge.test.mjs`) on a branch. Benchmarks should
run on actual Android hardware. No new CDN or mandatory server dependency.
