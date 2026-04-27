import type { DomoDataset } from "../types/domo.js";
import type { DomoClient } from "./client.js";

const DEFAULT_PAGE_LIMIT = 50;

export interface DatasetSearchResult {
  total: number;
  datasets: Array<
    Pick<DomoDataset, "id" | "name" | "description" | "rows" | "columns" | "owner" | "updatedAt">
  >;
}

export class DatasetsApi {
  constructor(private readonly client: DomoClient) {}

  async list(opts: { limit?: number; offset?: number } = {}): Promise<DomoDataset[]> {
    return this.client.request<DomoDataset[]>({
      host: "platform",
      path: "/v1/datasets",
      query: {
        limit: opts.limit ?? DEFAULT_PAGE_LIMIT,
        offset: opts.offset ?? 0,
      },
    });
  }

  async listAll(opts: { maxItems?: number } = {}): Promise<DomoDataset[]> {
    const all = await this.client.paginate<DomoDataset>({
      host: "platform",
      path: "/v1/datasets",
      limit: DEFAULT_PAGE_LIMIT,
    });
    if (opts.maxItems && all.length > opts.maxItems) {
      return all.slice(0, opts.maxItems);
    }
    return all;
  }

  async get(datasetId: string): Promise<DomoDataset> {
    return this.client.request<DomoDataset>({
      host: "platform",
      path: `/v1/datasets/${encodeURIComponent(datasetId)}`,
    });
  }

  async getSchema(datasetId: string): Promise<DomoDataset["schema"]> {
    const dataset = await this.get(datasetId);
    return dataset.schema;
  }

  /**
   * Run SQL against a Domo dataset. Uses POST /v1/datasets/query/execute/{id}
   * which is Domo's documented data-query endpoint.
   */
  async query(opts: { datasetId: string; sql: string }): Promise<{
    columns: string[];
    rows: unknown[][];
    rowCount: number;
  }> {
    const result = await this.client.request<{
      columns?: string[];
      rows?: unknown[][];
      numRows?: number;
      metadata?: Array<{ name: string; type?: string }>;
    }>({
      host: "platform",
      method: "POST",
      path: `/v1/datasets/query/execute/${encodeURIComponent(opts.datasetId)}`,
      body: { sql: opts.sql },
    });
    const columns = result.columns ?? result.metadata?.map((m) => m.name) ?? [];
    const rows = result.rows ?? [];
    return { columns, rows, rowCount: result.numRows ?? rows.length };
  }

  /**
   * Export full dataset as CSV. WARNING: full data transfer; only use when the
   * caller explicitly asked to export/download.
   */
  async exportCsv(opts: {
    datasetId: string;
    includeHeader?: boolean;
  }): Promise<string> {
    return this.client.requestText({
      host: "platform",
      path: `/v1/datasets/${encodeURIComponent(opts.datasetId)}/data`,
      query: { includeHeader: opts.includeHeader === false ? "false" : "true" },
      accept: "text/csv",
    });
  }

  /**
   * Resolve a dataset ID by exact-match name first, then case-insensitive
   * substring fuzzy match. Caller can pass `exact` to disable fuzzy.
   */
  async findByName(opts: { name: string; exact?: boolean }): Promise<DomoDataset | null> {
    const all = await this.listAll();
    const exactMatch = all.find((d) => d.name === opts.name);
    if (exactMatch) return exactMatch;
    if (opts.exact) return null;
    const target = opts.name.toLowerCase();
    return all.find((d) => d.name.toLowerCase().includes(target)) ?? null;
  }

  /**
   * Lightweight name/owner/description search with an optional limit.
   */
  async search(opts: { term: string; limit?: number }): Promise<DatasetSearchResult> {
    const term = opts.term.toLowerCase();
    const all = await this.listAll();
    const hits = all
      .filter((d) => {
        const haystack =
          `${d.name ?? ""} ${d.description ?? ""} ${d.owner?.name ?? ""}`.toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, opts.limit ?? 50);
    return {
      total: hits.length,
      datasets: hits.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        rows: d.rows,
        columns: d.columns,
        owner: d.owner,
        updatedAt: d.updatedAt,
      })),
    };
  }
}
