import type { DomoClient } from "./client.js";

const SEARCH_PATH = "/api/query/v1/functions/search";
const DETAIL_PATH = "/api/query/v1/functions/template";
const PAGE_SIZE = 5000;

export interface BeastModeSearchResult {
  id: number;
  name?: string;
  links?: Array<{ resource?: { type?: string; id?: string } }>;
}

export interface BeastModeDetail {
  id: number;
  name?: string;
  expression?: string;
  owner?: unknown;
  status?: string;
  global?: boolean;
  locked?: boolean;
  archived?: boolean;
  variable?: boolean;
  dataType?: string;
  aggregated?: boolean;
  created?: string | number;
  lastModified?: string | number;
  legacyId?: number | string;
  links?: Array<{
    resource?: { type?: string; id?: string };
    visible?: boolean;
    active?: boolean;
    valid?: boolean;
  }>;
}

export interface NormalizedBeastMode {
  id: number;
  name: string | undefined;
  expression: string | undefined;
  owner: unknown;
  status: string | undefined;
  global: boolean | undefined;
  locked: boolean | undefined;
  archived: boolean | undefined;
  variable: boolean | undefined;
  dataType: string | undefined;
  aggregated: boolean | undefined;
  created: string | number | undefined;
  lastModified: string | number | undefined;
  legacyId: number | string | undefined;
  links: Array<{
    resourceType: string | undefined;
    resourceId: string | undefined;
    resourceName?: string;
    visible: boolean | undefined;
    active: boolean | undefined;
    valid: boolean | undefined;
  }>;
}

export interface BeastModesByDataset {
  datasetId: string;
  datasetName?: string;
  beastModes: NormalizedBeastMode[];
}

export interface ExportBeastModesResult {
  datasets: BeastModesByDataset[];
  meta: {
    instance: string | undefined;
    generatedAt: string;
    totalDatasets: number;
    totalBeastModes: number;
  };
}

const SQL_CLEAN_PATTERNS: Array<[RegExp, string]> = [
  [/\\u0026/g, "&"],
  [/\\u003c/g, "<"],
  [/\\u003e/g, ">"],
  [/\\"/g, '"'],
];

function cleanSql(raw: string): string {
  let s = raw;
  for (const [re, sub] of SQL_CLEAN_PATTERNS) {
    s = s.replace(re, sub);
  }
  return s;
}

export class BeastModesApi {
  constructor(
    private readonly client: DomoClient,
    private readonly instance: string | undefined,
  ) {}

  /** Paginated search of all beast modes in the instance (no expressions). */
  async searchAll(): Promise<BeastModeSearchResult[]> {
    const results: BeastModeSearchResult[] = [];
    let offset = 0;
    while (true) {
      const data = await this.client.request<{
        results?: BeastModeSearchResult[];
        totalHits?: number;
        hasMore?: boolean;
      }>({
        host: "instance",
        method: "POST",
        path: SEARCH_PATH,
        body: {
          name: "",
          filters: [{ field: "notvariable" }],
          sort: { field: "name", ascending: true },
          limit: PAGE_SIZE,
          offset,
        },
      });
      const page = data.results ?? [];
      results.push(...page);
      const total = data.totalHits ?? 0;
      const hasMore = Boolean(data.hasMore);
      if (!hasMore || results.length >= total) break;
      offset += PAGE_SIZE;
    }
    return results;
  }

  /** Fetch one beast mode's full detail (including expression). */
  async getDetail(beastModeId: number): Promise<BeastModeDetail> {
    return this.client.request<BeastModeDetail>({
      host: "instance",
      path: `${DETAIL_PATH}/${beastModeId}`,
    });
  }

  /**
   * Export beast modes for the given dataset IDs. Returns a structure grouped
   * by dataset, including the calculation expressions.
   */
  async exportForDatasets(opts: {
    datasetIds: string[];
    datasetIdToName?: Record<string, string>;
    concurrency?: number;
  }): Promise<ExportBeastModesResult> {
    const all = await this.searchAll();
    const datasetIdSet = new Set(opts.datasetIds);
    const matched = all.filter((bm) =>
      bm.links?.some(
        (lk) =>
          lk.resource?.type === "DATA_SOURCE" &&
          lk.resource?.id !== undefined &&
          datasetIdSet.has(lk.resource.id),
      ),
    );

    const concurrency = opts.concurrency ?? 8;
    const details = await fetchWithConcurrency(
      matched.map((bm) => bm.id),
      concurrency,
      async (id) => {
        try {
          return await this.getDetail(id);
        } catch {
          return null;
        }
      },
    );
    const validDetails = details.filter((d): d is BeastModeDetail => d !== null);
    const grouped = groupByDataset(validDetails, opts.datasetIds, opts.datasetIdToName);

    return {
      datasets: grouped,
      meta: {
        instance: this.instance,
        generatedAt: new Date().toISOString(),
        totalDatasets: opts.datasetIds.length,
        totalBeastModes: grouped.reduce((sum, d) => sum + d.beastModes.length, 0),
      },
    };
  }
}

function normalize(
  detail: BeastModeDetail,
  datasetIdToName?: Record<string, string>,
): NormalizedBeastMode {
  const expr =
    typeof detail.expression === "string" ? cleanSql(detail.expression) : detail.expression;
  return {
    id: detail.id,
    name: detail.name,
    expression: expr,
    owner: detail.owner,
    status: detail.status,
    global: detail.global,
    locked: detail.locked,
    archived: detail.archived,
    variable: detail.variable,
    dataType: detail.dataType,
    aggregated: detail.aggregated,
    created: detail.created,
    lastModified: detail.lastModified,
    legacyId: detail.legacyId,
    links: (detail.links ?? []).map((lk) => {
      const rid = lk.resource?.id;
      const out: NormalizedBeastMode["links"][number] = {
        resourceType: lk.resource?.type,
        resourceId: rid,
        visible: lk.visible,
        active: lk.active,
        valid: lk.valid,
      };
      if (datasetIdToName && lk.resource?.type === "DATA_SOURCE" && rid && datasetIdToName[rid]) {
        out.resourceName = datasetIdToName[rid];
      }
      return out;
    }),
  };
}

function groupByDataset(
  details: BeastModeDetail[],
  datasetIds: string[],
  datasetIdToName?: Record<string, string>,
): BeastModesByDataset[] {
  const datasetIdSet = new Set(datasetIds);
  const index = new Map<string, NormalizedBeastMode[]>(datasetIds.map((id) => [id, []]));
  for (const bm of details) {
    const normalized = normalize(bm, datasetIdToName);
    const seen = new Set<string>();
    for (const link of bm.links ?? []) {
      const dsId = link.resource?.id;
      if (
        link.resource?.type === "DATA_SOURCE" &&
        dsId &&
        datasetIdSet.has(dsId) &&
        !seen.has(dsId)
      ) {
        index.get(dsId)?.push(normalized);
        seen.add(dsId);
      }
    }
  }
  return datasetIds.map((id) => {
    const entry: BeastModesByDataset = { datasetId: id, beastModes: index.get(id) ?? [] };
    if (datasetIdToName?.[id]) entry.datasetName = datasetIdToName[id];
    return entry;
  });
}

async function fetchWithConcurrency<TIn, TOut>(
  inputs: TIn[],
  concurrency: number,
  fn: (input: TIn) => Promise<TOut>,
): Promise<TOut[]> {
  const results: TOut[] = new Array(inputs.length);
  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(concurrency, inputs.length); w++) {
    workers.push(
      (async () => {
        while (true) {
          const myIndex = cursor++;
          if (myIndex >= inputs.length) break;
          const input = inputs[myIndex] as TIn;
          results[myIndex] = await fn(input);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}
