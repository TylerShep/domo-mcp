# Contributing to domo-mcp

Thanks for your interest in contributing!

## Local setup

```bash
git clone https://github.com/TylerShep/domo-mcp.git
cd domo-mcp
npm install
cp .env.example .env  # fill in your Domo credentials
```

## Workflow

1. Fork the repo and create a feature branch from `main`.
2. Make your changes. Keep commits small and focused.
3. Run the full local check before opening a PR:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```
4. Open a PR with a clear description of what changed and why.

## Adding a new tool

1. Add the implementation function in the appropriate `src/domo/*.ts` module.
2. Register the tool in the matching `src/tools/*.ts` file with a Zod input schema.
3. Add a unit test in `test/unit/` with mocked HTTP via MSW.
4. Update the tool catalog table in `README.md`.

## Auth conventions

- Use `AuthManager` for all HTTP calls. It picks the right strategy based on the endpoint and available credentials.
- If a tool requires a specific auth mode (e.g., developer token only), throw `AuthRequiredError` from `src/auth/manager.ts` with a clear message naming the missing env vars.

## Testing live against a real Domo instance

```bash
DOMO_INSTANCE=... DOMO_DEVELOPER_TOKEN=... npm run smoke
```

The smoke script in `scripts/smoke.ts` exercises a small set of read-only calls against a real instance. Don't commit any captured data.

## Code style

- Biome for lint + format (`npm run lint:fix`).
- Prefer `import type` for type-only imports.
- All public exports must have explicit return types.
- No `any` without a comment explaining why.
