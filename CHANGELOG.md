# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-27

Initial public release.

### Added
- 35+ read-only MCP tools across datasets, cards, pages, users, groups, beast modes, dataflows, governance, and semantic-layer generation.
- Three auth strategies with automatic resolution: OAuth2 client credentials, developer access token, optional Playwright browser fallback.
- Multi-provider AI gateway with adapters for OpenAI (and any OpenAI-compatible endpoint), Anthropic, Google Gemini, and xAI Grok.
- Dual-host HTTP client with retry/backoff, pagination helpers, and 401 token-refresh handling.
- Card PNG rendering returned as a base64 image content block.
- Generative tools: `domo_generate_semantic_layer` and `domo_explain_card_in_business_terms`.
- Single-file ESM bundle, distributed as `@tylershep/domo-mcp` for one-line `npx` install.
- Example MCP host configs for Claude Desktop, Cursor, Cline, Continue, and Zed.
- Vitest + MSW unit-test suite covering auth flows, pagination, error cases, page tree, and the semantic-layer generator.

[Unreleased]: https://github.com/TylerShep/domo-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/TylerShep/domo-mcp/releases/tag/v0.1.0
