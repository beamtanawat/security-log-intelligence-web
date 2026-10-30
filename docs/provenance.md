# Provenance and repository separation

The user chose a separate web application repository on 2026-10-30. This is a product separation, not a claim that the underlying analysis code was invented from scratch today.

Upstream: https://github.com/beamtanawat/security-log-intelligence
Source commit: 47d931dd21175146766837773ce5825a5276bdf3

The parser, normalization and detection files listed in provenance-manifest.json are copied unchanged. Their SHA-256 hashes let reviewers verify their origin. The upload/job/session/summary/export backend was implemented during this conversation in a local working copy, then extracted here. No backend changes were pushed into the old repository.

The new repository carries the modules needed to run and test the rules-only web product. It intentionally excludes research runners, frozen metrics, raw data, model bundles, virtual environments and prior Git metadata. The initial commit establishes this separate product and does not represent its reused components as wholly new work.

For this extracted web app, scientific dependencies are not installed because the runtime imports only the standard-library analysis core plus FastAPI/Uvicorn/multipart. Versions of the retained web/test dependencies are unchanged. New regression tests run independently of upstream tests that depend on unavailable ignored artifacts or Windows-only publication.

Plans and progress documents include historical context. References to src/api/ or ML modules describe the upstream research project; these modules are not part of this web repository. Claude should work against docs/web/api-contract.md and the actual src/web_api/.

The UNSW web profiler additionally reuses the feature names and label mapping documented in upstream src/unsupervised/contracts.py and src/benchmarks/unsw_contract.py at the same source revision. It is a new streaming profiling adapter, not a copied/trained classifier. No upstream data, preprocessing state or benchmark result bundle was imported.
