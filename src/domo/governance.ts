import type { DomoCard, DomoDataset } from "../types/domo.js";
import type { CardsApi } from "./cards.js";
import type { DomoClient } from "./client.js";
import type { DatasetsApi } from "./datasets.js";

/**
 * Governance helpers — generic naming-convention parsing, topic/stage rollups,
 * stale/unused dataset detection. Inspired by TES `DomoMetaData` but without
 * the company-specific topic codes.
 *
 * The naming convention is the widely-used Domo pattern:
 *   STAGE[VERSION][FREQUENCY] | TOPIC | Specific Name
 * e.g.  "PROD2D | Sales | Pipeline Snapshot"
 *
 * Users can extend stage/frequency dictionaries by passing custom maps or just
 * read the raw `stage`/`frequency` strings.
 */

const STAGE_ROOTS: Record<string, string> = {
  PROD: "Production",
  BETA: "Beta / Testing",
  DEV: "Development",
  STAGE: "Staging",
  STG: "Staging",
  TEMP: "Temporary",
  TEST: "Test",
  HIST: "Historical",
  VIEW: "View",
  CORE: "Core Dataset",
  DEPR: "Deprecated",
  DEPRECATED: "Deprecated",
};

const FREQUENCY_CODES: Record<string, string> = {
  D: "Daily",
  W: "Weekly",
  M: "Monthly",
  H: "Hourly",
  Q: "Quarterly",
  Y: "Yearly",
  X: "On-demand",
  Z: "Static / Manual",
  S: "Scheduled",
  R: "Real-time",
};

const STAGE_RE = /^(?<root>[A-Z][A-Za-z&+\s]+?)\s*(?<version>\d+)\s*(?<freq>[A-Z])?$/;

export interface ParsedDatasetName {
  rawName: string;
  stage: string;
  stageLabel: string;
  version: string;
  frequency: string;
  frequencyLabel: string;
  topic: string;
  specificName: string;
  segmentCount: number;
}

export function parseDatasetName(name: string): ParsedDatasetName {
  const empty: ParsedDatasetName = {
    rawName: name ?? "",
    stage: "",
    stageLabel: "",
    version: "",
    frequency: "",
    frequencyLabel: "",
    topic: "",
    specificName: name ?? "",
    segmentCount: 0,
  };
  if (!name || typeof name !== "string") return empty;

  const segments = name.split("|").map((s) => s.trim());
  const segmentCount = segments.length;

  let stage = "";
  let stageLabel = "";
  let version = "";
  let frequency = "";
  let frequencyLabel = "";
  let topic = "";
  let specificName = name;

  if (segmentCount >= 2 && segments[0]) {
    const prefix = parsePrefix(segments[0]);
    stage = prefix.stage;
    stageLabel = prefix.stageLabel;
    version = prefix.version;
    frequency = prefix.frequency;
    frequencyLabel = prefix.frequencyLabel;
    if (segmentCount === 2 && segments[1] !== undefined) {
      specificName = segments[1];
    } else if (segmentCount === 3 && segments[1] !== undefined && segments[2] !== undefined) {
      topic = segments[1];
      specificName = segments[2];
    } else if (segments[1] !== undefined) {
      topic = segments[1];
      specificName = segments.slice(2).join(" | ");
    }
  } else if (segments[0] !== undefined) {
    specificName = segments[0];
  }

  return {
    rawName: name,
    stage,
    stageLabel,
    version,
    frequency,
    frequencyLabel,
    topic,
    specificName,
    segmentCount,
  };
}

function parsePrefix(rawPrefix: string): {
  stage: string;
  stageLabel: string;
  version: string;
  frequency: string;
  frequencyLabel: string;
} {
  const cleaned = rawPrefix.trim();
  const upper = cleaned.toUpperCase();
  const knownByLength = Object.keys(STAGE_ROOTS).sort((a, b) => b.length - a.length);

  const m = STAGE_RE.exec(upper);
  if (m?.groups) {
    let root = (m.groups.root ?? "").trim();
    for (const known of knownByLength) {
      if (root === known || upper.startsWith(known)) {
        root = known;
        break;
      }
    }
    const label = STAGE_ROOTS[root] ?? root;
    const version = m.groups.version ?? "";
    const freq = m.groups.freq ?? "";
    const freqLabel = freq ? (FREQUENCY_CODES[freq] ?? freq) : "";
    return { stage: root, stageLabel: label, version, frequency: freq, frequencyLabel: freqLabel };
  }

  for (const known of knownByLength) {
    if (upper === known) {
      return {
        stage: known,
        stageLabel: STAGE_ROOTS[known] ?? known,
        version: "",
        frequency: "",
        frequencyLabel: "",
      };
    }
  }

  return { stage: upper, stageLabel: upper, version: "", frequency: "", frequencyLabel: "" };
}

export interface InstanceSummary {
  totalDatasets: number;
  totalCards: number;
  totalUsers: number;
  totalGroups: number;
  byStage: Record<string, number>;
  byTopic: Record<string, number>;
  staleDatasetCount: number;
  unusedDatasetCount: number;
  generatedAt: string;
}

export class GovernanceApi {
  constructor(
    private readonly client: DomoClient,
    private readonly datasets: DatasetsApi,
    private readonly cards: CardsApi,
  ) {}

  async parsedDatasets(): Promise<Array<DomoDataset & { parsed: ParsedDatasetName }>> {
    const all = await this.datasets.listAll();
    return all.map((d) => ({ ...d, parsed: parseDatasetName(d.name ?? "") }));
  }

  async datasetsByTopic(
    topic: string,
  ): Promise<Array<DomoDataset & { parsed: ParsedDatasetName }>> {
    const parsed = await this.parsedDatasets();
    const target = topic.toLowerCase();
    return parsed.filter((d) => d.parsed.topic.toLowerCase() === target);
  }

  async topicSummary(): Promise<Record<string, number>> {
    const parsed = await this.parsedDatasets();
    const counts: Record<string, number> = {};
    for (const d of parsed) {
      const key = d.parsed.topic || "(no topic)";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([, a], [, b]) => b - a));
  }

  async stageSummary(): Promise<Record<string, number>> {
    const parsed = await this.parsedDatasets();
    const counts: Record<string, number> = {};
    for (const d of parsed) {
      const key = d.parsed.stage || "(no stage)";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([, a], [, b]) => b - a));
  }

  async staleDatasets(opts: { days?: number } = {}): Promise<DomoDataset[]> {
    const days = opts.days ?? 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const all = await this.datasets.listAll();
    return all.filter((d) => {
      const ts = d.dataCurrentAt ?? d.updatedAt;
      if (!ts) return false;
      const t = Date.parse(ts);
      return Number.isFinite(t) && t < cutoff;
    });
  }

  async unusedDatasets(): Promise<DomoDataset[]> {
    const [allDatasets, allCards] = await Promise.all([
      this.datasets.listAll(),
      this.cards.list({ limit: 100_000 }),
    ]);
    const usedIds = new Set<string>();
    for (const card of allCards) {
      for (const id of card.datasourceIds) usedIds.add(id);
    }
    return allDatasets.filter((d) => !usedIds.has(d.id));
  }

  async recentlyModifiedCards(opts: { days?: number } = {}): Promise<DomoCard[]> {
    const days = opts.days ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const all = await this.cards.list({ limit: 100_000 });
    const fullCards: DomoCard[] = [];
    for (const summary of all.slice(0, 200)) {
      const card = await this.cards.get(summary.cardId);
      const lastModRaw =
        (card as Record<string, unknown>).lastModified ??
        (card as Record<string, unknown>).updatedAt ??
        (card as Record<string, unknown>).updated;
      if (typeof lastModRaw === "string") {
        const t = Date.parse(lastModRaw);
        if (Number.isFinite(t) && t >= cutoff) fullCards.push(card);
      } else if (typeof lastModRaw === "number" && lastModRaw >= cutoff) {
        fullCards.push(card);
      }
    }
    return fullCards;
  }

  async instanceSummary(): Promise<InstanceSummary> {
    const [parsed, cards] = await Promise.all([
      this.parsedDatasets(),
      this.cards.list({ limit: 100_000 }),
    ]);
    const byStage: Record<string, number> = {};
    const byTopic: Record<string, number> = {};
    const usedDsIds = new Set<string>();
    for (const c of cards) {
      for (const id of c.datasourceIds) usedDsIds.add(id);
    }
    let staleCount = 0;
    let unusedCount = 0;
    const cutoff30d = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const d of parsed) {
      const stage = d.parsed.stage || "(no stage)";
      const topic = d.parsed.topic || "(no topic)";
      byStage[stage] = (byStage[stage] ?? 0) + 1;
      byTopic[topic] = (byTopic[topic] ?? 0) + 1;
      const ts = d.dataCurrentAt ?? d.updatedAt;
      if (ts && Date.parse(ts) < cutoff30d) staleCount++;
      if (!usedDsIds.has(d.id)) unusedCount++;
    }
    const usersAll = await this.client.paginate<unknown>({
      host: "platform",
      path: "/v1/users",
      limit: 50,
    });
    const groupsAll = await this.client.paginate<unknown>({
      host: "platform",
      path: "/v1/groups",
      limit: 50,
    });
    return {
      totalDatasets: parsed.length,
      totalCards: cards.length,
      totalUsers: usersAll.length,
      totalGroups: groupsAll.length,
      byStage,
      byTopic,
      staleDatasetCount: staleCount,
      unusedDatasetCount: unusedCount,
      generatedAt: new Date().toISOString(),
    };
  }
}
