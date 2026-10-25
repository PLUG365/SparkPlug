# Security maintenance — 2026-10-25

The main CI already requests latest Node22, and its prior successful run selected
22.23.4. The Docker build/runtime images are already pinned to22.23.4-alpine.
The record-demo workflow had only requested major22, allowing an older runner
cache. It now selects exact22.23.4 to include the CVE-2026-111497 Brotli fix.
See the [Node security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).

This changes only the demo job's Node selection. The workflow was not executed
for validation because it generates and commits media. YAML and baseline-diff
checks verify the pin statically. No dependencies, Docker settings, production
application code, credentials or user media are changed. Revisit exact pins when
newer security releases arrive. Confirm the runtime in its next normal demo run.
