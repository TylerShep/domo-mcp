# domo-mcp

[![npm version](https://img.shields.io/npm/v/@tylershep/domo-mcp.svg)](https://www.npmjs.com/package/@tylershep/domo-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives any AI agent (Claude Desktop, Cursor, Cline, Continue, Zed, etc.) a comprehensive **read-only** toolkit for Domo: datasets, cards, pages, users, beast modes, dataflows, governance, and AI-generated semantic-layer documentation.

> Built and battle-tested by a working Domo developer. Ports the best pieces of several internal Python tools into one zero-install MCP server.

## Features

- **35+ tools** spanning datasets, cards, pages, identity, metadata, governance, and semantic-layer generation
- **Three auth modes:** OAuth2 client credentials, developer access token, optional Playwright browser fallback
- **Multi-provider AI:** OpenAI, Anthropic, Google Gemini, xAI Grok (or any OpenAI-compatible endpoint)
- **Read-only by design:** safe to give to any agent; no write APIs in v1
- **Zero install:** runs via `npx`, no Python or JVM required
- **Fully typed:** TypeScript + Zod schemas for every input and response

## Quick start

### 1. Get Domo credentials

Pick at least one auth method:

- **Developer access token** (recommended for full feature support — needed for page tree, beast modes search, Redshift connector queries):
  Generate at `https://{your-instance}.domo.com/admin/security/accesstokens`
- **OAuth2 client credentials**: create a Custom App in the [Domo Developer Portal](https://developer.domo.com/portal/) with the `data`, `dashboard`, and `user` scopes.

### 2. Add to your MCP host

#### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "domo": {
      "command": "npx",
      "args": ["-y", "@tylershep/domo-mcp"],
      "env": {
        "DOMO_INSTANCE": "yourcompany",
        "DOMO_DEVELOPER_TOKEN": "your-token-here",
        "DOMO_CLIENT_ID": "your-client-id",
        "DOMO_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

#### Cursor

Edit `~/.cursor/mcp.json` (or use Cursor Settings -> Tools & Integrations -> MCP):

```json
{
  "mcpServers": {
    "domo": {
      "command": "npx",
      "args": ["-y", "@tylershep/domo-mcp"],
      "env": {
        "DOMO_INSTANCE": "yourcompany",
        "DOMO_DEVELOPER_TOKEN": "your-token-here"
      }
    }
  }
}
```

#### Cline

See [`examples/cline-config.json`](examples/cline-config.json) — adds a sensible `autoApprove` allowlist for the safest read-only tools.

#### Continue

See [`examples/continue-config.json`](examples/continue-config.json) for the `experimental.modelContextProtocolServers` block.

#### Zed

See [`examples/zed-config.json`](examples/zed-config.json) for the `context_servers` block.

### 3. Restart your MCP host

Then ask your agent things like:

- *"List all datasets in our Domo with 'sales' in the name."*
- *"Render the executive dashboard's KPI card as a PNG and describe what's in it."*
- *"Document the 'Customer Health' dashboard in business language for a stakeholder."*
- *"Which datasets haven't been updated in over 90 days?"*

## Tool catalog

### Datasets (8)
| Tool | Description |
|---|---|
| `domo_test_connection` | Verify credentials work and report which auth modes are active |
| `domo_list_datasets` | Paginated list of all datasets |
| `domo_get_dataset` | Full dataset metadata (schema, owner, sizes, timestamps) |
| `domo_get_dataset_schema` | Just the columns + types for a dataset |
| `domo_query_dataset` | Run SQL against a Domo dataset |
| `domo_export_dataset_csv` | Download dataset rows as CSV (or JSON-rows) |
| `domo_search_datasets` | Search the governance meta-dataset by name/owner/topic |
| `domo_get_dataset_by_name` | Resolve a dataset ID by exact or fuzzy name match |

### Cards (5)
| Tool | Description |
|---|---|
| `domo_list_cards` | Paginated cards with optional page/tag filters |
| `domo_get_card` | Full card metadata |
| `domo_render_card_png` | Render a card as a PNG image (returned as base64) |
| `domo_get_dataset_for_card` | Resolve the dataset feeding a given card |
| `domo_recently_modified_cards` | Cards modified in the last N days |

### Pages (4)
| Tool | Description |
|---|---|
| `domo_list_pages` | Paginated pages list |
| `domo_get_page` | Full page metadata + cards on the page |
| `domo_get_page_collections` | Card collections (sections) on a page |
| `domo_get_page_tree` | Recursive page hierarchy starting from a root page (instance API) |

### Identity (4)
| Tool | Description |
|---|---|
| `domo_list_users` | Paginated users list |
| `domo_get_user` | Single user details |
| `domo_list_groups` | Paginated groups list |
| `domo_get_group` | Single group details |

### Metadata (6)
| Tool | Description |
|---|---|
| `domo_export_beast_modes` | All beast modes (calculated columns) for one or more datasets |
| `domo_get_beast_mode` | Single beast mode definition by ID |
| `domo_document_dataflow` | Generate a structured doc of a Magic ETL dataflow |
| `domo_export_card_metadata` | Detailed card-level metadata (columns used, beast modes referenced, etc.) |
| `domo_export_redshift_connector_queries` | All connector SQL for Redshift-backed datasets |
| `domo_get_redshift_query_for_dataset` | Connector SQL for a single Redshift dataset |

### Governance (6)
| Tool | Description |
|---|---|
| `domo_parse_dataset_name` | Parse `STAGE \| TOPIC \| Name` naming conventions |
| `domo_datasets_by_topic` | All datasets matching a parsed topic |
| `domo_topic_summary` | Stats per topic (count, freshness, owner mix) |
| `domo_instance_summary` | High-level instance health stats |
| `domo_stale_datasets` | Datasets not updated in N days |
| `domo_unused_datasets` | Datasets with no card references |

### Semantic / AI (2)
| Tool | Description |
|---|---|
| `domo_generate_semantic_layer` | Generate a markdown business-language doc for a dashboard |
| `domo_explain_card_in_business_terms` | Plain-English explanation of one card |

## Configuration reference

See [`.env.example`](.env.example) for the full list. All variables can also be supplied via the `env` key of your MCP host config.

| Variable | Required for | Description |
|---|---|---|
| `DOMO_INSTANCE` | Dev token + instance APIs | Your Domo subdomain (e.g. `acme` for `acme.domo.com`) |
| `DOMO_DEVELOPER_TOKEN` | Instance APIs | Token from `/admin/security/accesstokens` |
| `DOMO_CLIENT_ID` | OAuth APIs | OAuth2 client ID from Developer Portal |
| `DOMO_CLIENT_SECRET` | OAuth APIs | OAuth2 client secret |
| `DOMO_USERNAME` / `DOMO_PASSWORD` | Optional | Playwright browser fallback (install `playwright` separately) |
| `AI_PROVIDER` | AI tools only | `openai` \| `anthropic` \| `gemini` \| `grok` |
| `OPENAI_API_KEY` etc. | AI tools only | Provider-specific keys |
| `AI_MODEL` | Optional | Override the default model for the chosen provider |

## What's not in v1

Intentionally scoped out for safety and simplicity:

- **Writes** (create dataset, replace data, share page) — coming in v2 behind an opt-in flag
- **Slack / Teams / email destinations** — those live in [domo-slack-ext-reporting](https://github.com/TylerShep/domo-slack-ext-reporting)
- **Jira / Gmail / approval workflows** — internal-tooling specific
- **Java JAR engine** — the REST surface is sufficient and zero-install

## Development

```bash
git clone https://github.com/TylerShep/domo-mcp.git
cd domo-mcp
npm install
cp .env.example .env  # fill in your credentials
npm run dev
```

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Releases

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

MIT - see [LICENSE](LICENSE).

## Acknowledgements

This server consolidates patterns from several internal Domo tools:
- `dsl-beast` for the auth strategy and semantic-layer generation
- `domo-slack-ext-reporting` for card rendering and OAuth token caching
- `TES/PROSERV-CURSOR-TOOLS` for the comprehensive metadata surface

Built on the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
