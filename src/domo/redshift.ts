import type { DomoClient } from "./client.js";
import type { DatasetsApi } from "./datasets.js";

const DATASOURCE_META_PATH = "/api/data/v3/datasources";
const STREAM_PATH = "/api/data/v1/streams";
const REDSHIFT_MARKERS = ["redshift", "redshiftssh", "redshiftunload", "redshift-unload"];

interface DatasourceMeta {
  streamId?: number;
  displayType?: string;
  dataProviderType?: string;
  rowCount?: number;
  columnCount?: number;
  status?: string;
}

interface ConfigItem {
  name?: string;
  value?: unknown;
}

interface StreamData {
  transport?: { description?: string };
  configuration?: ConfigItem[];
  configurations?: ConfigItem[];
}

export interface RedshiftDatasetEntry {
  datasetId: string;
  name: string;
  streamId: number;
  connectorDescription: string | undefined;
  query: string;
  settings: Record<string, unknown>;
  dataSource: {
    displayType: string | undefined;
    dataProviderType: string | undefined;
    rowCount: number | undefined;
    columnCount: number | undefined;
    status: string | undefined;
  };
}

export interface RedshiftExportResult {
  connectorFilter: "redshift";
  datasets: RedshiftDatasetEntry[];
  meta: {
    instance: string | undefined;
    totalDatasetsScanned: number;
    redshiftDatasetCount: number;
    generatedAt: string;
  };
}

export class RedshiftApi {
  constructor(
    private readonly client: DomoClient,
    private readonly datasets: DatasetsApi,
    private readonly instance: string | undefined,
  ) {}

  async exportAll(opts: { concurrency?: number } = {}): Promise<RedshiftExportResult> {
    const datasetList = await this.datasets.listAll();
    const concurrency = opts.concurrency ?? 8;
    const results: RedshiftDatasetEntry[] = [];
    let cursor = 0;
    const workers: Promise<void>[] = [];
    for (let w = 0; w < Math.min(concurrency, datasetList.length); w++) {
      workers.push(
        (async () => {
          while (true) {
            const i = cursor++;
            if (i >= datasetList.length) break;
            const ds = datasetList[i];
            if (!ds) continue;
            const entry = await this.tryBuildEntry(ds.id, ds.name);
            if (entry) results.push(entry);
          }
        })(),
      );
    }
    await Promise.all(workers);

    return {
      connectorFilter: "redshift",
      datasets: results,
      meta: {
        instance: this.instance,
        totalDatasetsScanned: datasetList.length,
        redshiftDatasetCount: results.length,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async getQueryForDataset(datasetId: string): Promise<RedshiftDatasetEntry | null> {
    const ds = await this.datasets.get(datasetId);
    return this.tryBuildEntry(ds.id, ds.name);
  }

  private async tryBuildEntry(
    datasetId: string,
    name: string,
  ): Promise<RedshiftDatasetEntry | null> {
    const meta = await this.fetchDatasourceMeta(datasetId);
    if (!meta?.streamId) return null;
    const stream = await this.fetchStream(meta.streamId);
    if (!stream) return null;
    const transport = stream.transport;
    if (!isRedshift(transport)) return null;
    const configList = stream.configuration ?? stream.configurations ?? [];
    const settings = configToMap(configList);
    const queryRaw = settings.query ?? settings.sql ?? "";
    const query = typeof queryRaw === "string" ? queryRaw : String(queryRaw);
    const restSettings: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(settings)) {
      if (k !== "query" && k !== "sql") restSettings[k] = v;
    }
    return {
      datasetId,
      name,
      streamId: meta.streamId,
      connectorDescription: transport?.description,
      query,
      settings: restSettings,
      dataSource: {
        displayType: meta.displayType,
        dataProviderType: meta.dataProviderType,
        rowCount: meta.rowCount,
        columnCount: meta.columnCount,
        status: meta.status,
      },
    };
  }

  private async fetchDatasourceMeta(datasetId: string): Promise<DatasourceMeta | null> {
    try {
      return await this.client.request<DatasourceMeta>({
        host: "instance",
        path: `${DATASOURCE_META_PATH}/${encodeURIComponent(datasetId)}`,
      });
    } catch {
      return null;
    }
  }

  private async fetchStream(streamId: number): Promise<StreamData | null> {
    try {
      return await this.client.request<StreamData>({
        host: "instance",
        path: `${STREAM_PATH}/${streamId}`,
      });
    } catch {
      return null;
    }
  }
}

function isRedshift(transport: { description?: string } | undefined): boolean {
  if (!transport) return false;
  const desc = (transport.description ?? "").toLowerCase();
  return REDSHIFT_MARKERS.some((m) => desc.includes(m));
}

function configToMap(items: ConfigItem[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const it of items) {
    if (it.name !== undefined) out[it.name] = it.value;
  }
  return out;
}
