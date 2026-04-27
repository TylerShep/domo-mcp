import type { AIProvider } from "../ai/gateway.js";
import type { DomoCard } from "../types/domo.js";
import { logger } from "../utils/logger.js";
import type { BeastModesApi, NormalizedBeastMode } from "./beastModes.js";
import type { CardsApi } from "./cards.js";
import type { DatasetsApi } from "./datasets.js";
import type { PagesApi } from "./pages.js";

const SYSTEM_TRANSLATE_CARD = `You are a business analyst who translates technical Domo reporting metadata into clear, non-technical language. When given a card's configuration (chart type, columns, Beast Mode formulas, filters), produce a concise business description that explains:
1. What this chart/card shows in plain English
2. What the calculations (Beast Modes) mean in business terms
3. What filters or date ranges apply
4. What insights or decisions this card supports

Be concise (3-6 sentences per card). Avoid technical jargon like "Beast Mode", "CASE WHEN", "x-axis". Instead say "calculated field", "categorizes by", "plots over time", etc.`;

const SYSTEM_DASHBOARD_OVERVIEW =
  "You are a business analyst writing documentation for executive stakeholders. Given a dashboard name and summaries of all its cards, write a 3-5 sentence high-level overview of what this dashboard covers, who its intended audience is, and what business questions it answers. Be clear and concise.";

export interface SemanticLayerOptions {
  pageId?: string | number;
  pageName?: string;
  /** Maximum number of cards to translate. Defaults to 50. Generation is O(n) AI calls. */
  maxCards?: number;
}

export interface SemanticLayerResult {
  markdown: string;
  meta: {
    dashboardName: string;
    pageId: string;
    cardCount: number;
    aiProvider: string;
    model: string;
    generatedAt: string;
  };
}

export class SemanticLayerGenerator {
  constructor(
    private readonly pages: PagesApi,
    private readonly cards: CardsApi,
    private readonly datasets: DatasetsApi,
    private readonly beastModes: BeastModesApi | null,
    private readonly ai: AIProvider,
    private readonly instance: string | undefined,
  ) {}

  async generate(opts: SemanticLayerOptions): Promise<SemanticLayerResult> {
    const { pageId, pageName } = await this.resolvePage(opts);
    const cardSummaries = await this.cards.list({ page: pageName });
    const cards = cardSummaries.slice(0, opts.maxCards ?? 50);
    if (cards.length === 0) {
      throw new Error(`No cards found on dashboard "${pageName}".`);
    }

    const datasetIds = unique(cards.flatMap((c) => c.datasourceIds));
    const datasetIdToName: Record<string, string> = {};
    for (const id of datasetIds) {
      try {
        const ds = await this.datasets.get(id);
        if (ds.name) datasetIdToName[id] = ds.name;
      } catch (err) {
        logger.debug(`Could not fetch dataset ${id}: ${(err as Error).message}`);
      }
    }

    let beastModesByDataset: Record<string, NormalizedBeastMode[]> = {};
    if (this.beastModes && datasetIds.length > 0) {
      try {
        const bm = await this.beastModes.exportForDatasets({ datasetIds, datasetIdToName });
        beastModesByDataset = Object.fromEntries(
          bm.datasets.map((d) => [d.datasetId, d.beastModes]),
        );
      } catch (err) {
        logger.warn(
          `Could not fetch beast modes (continuing without them): ${(err as Error).message}`,
        );
      }
    }

    const cardSections: string[] = [];
    const cardSummaryLines: string[] = [];

    for (let i = 0; i < cards.length; i++) {
      const summary = cards[i];
      if (!summary) continue;
      let fullCard: DomoCard;
      try {
        fullCard = await this.cards.get(summary.cardId);
      } catch (err) {
        logger.warn(`Could not fetch card ${summary.cardId}: ${(err as Error).message}`);
        continue;
      }
      const datasetNames = summary.datasourceIds
        .map((id) => datasetIdToName[id])
        .filter((n): n is string => Boolean(n));
      const relatedBeastModes: NormalizedBeastMode[] = [];
      for (const dsId of summary.datasourceIds) {
        const bms = beastModesByDataset[dsId];
        if (bms) relatedBeastModes.push(...bms);
      }

      const context = buildCardContext({
        card: fullCard,
        title: summary.title,
        type: summary.type,
        datasetNames,
        beastModes: relatedBeastModes,
      });

      let businessDesc = "_Translation unavailable._";
      try {
        businessDesc = await this.ai.chatCompletion({
          system: SYSTEM_TRANSLATE_CARD,
          user: context,
          temperature: 0.3,
          maxTokens: 800,
        });
      } catch (err) {
        logger.warn(`AI translation failed for card "${summary.title}": ${(err as Error).message}`);
      }

      cardSummaryLines.push(`- ${summary.title}: ${businessDesc.slice(0, 200)}`);

      let section = `### ${i + 1}. ${summary.title}\n\n${businessDesc}\n\n`;
      section += "| Detail | Value |\n|--------|-------|\n";
      section += `| Chart type | ${summary.type ?? "Unknown"} |\n`;
      section += `| Source dataset(s) | ${datasetNames.join(", ") || "Unknown"} |\n`;
      section += `| Card ID | ${summary.cardId} |\n`;
      if (this.instance && summary.cardUrn) {
        section += `| Card URL | [View in Domo](https://${this.instance}.domo.com/kpis/details/${summary.cardId}) |\n`;
      }
      if (relatedBeastModes.length) {
        section += "\n**Calculations:**\n";
        for (const bm of relatedBeastModes) {
          section += `- **${bm.name}** (${bm.dataType ?? "?"}): \`${bm.expression?.slice(0, 200) ?? ""}\`\n`;
        }
      }
      cardSections.push(section);
    }

    let overview = `This dashboard contains ${cards.length} cards.`;
    try {
      overview = await this.ai.chatCompletion({
        system: SYSTEM_DASHBOARD_OVERVIEW,
        user: `Dashboard: ${pageName}\n\nCard summaries:\n${cardSummaryLines.join("\n")}`,
        temperature: 0.3,
        maxTokens: 600,
      });
    } catch (err) {
      logger.warn(`Dashboard summary AI call failed: ${(err as Error).message}`);
    }

    const now = new Date();
    const dashboardUrl = this.instance ? `https://${this.instance}.domo.com/page/${pageId}` : "";
    const lines: string[] = [
      `# ${pageName}\n`,
      "> Auto-generated semantic-layer documentation.",
      `> Generated: ${now.toUTCString()}`,
      ...(dashboardUrl ? [`> Dashboard URL: ${dashboardUrl}`] : []),
      "",
      `## Overview\n\n${overview}\n`,
      `---\n\n## Cards (${cards.length} total)\n`,
      ...cardSections.flatMap((s) => [s, "---\n"]),
    ];

    return {
      markdown: lines.join("\n"),
      meta: {
        dashboardName: pageName,
        pageId: String(pageId),
        cardCount: cards.length,
        aiProvider: this.ai.name,
        model: this.ai.defaultModel,
        generatedAt: now.toISOString(),
      },
    };
  }

  async explainCard(cardId: string | number): Promise<string> {
    const card = await this.cards.get(cardId);
    const datasetIds = (card.datasources ?? []).map((d) => d.id).filter(Boolean);
    const datasetNames: string[] = [];
    let beastModes: NormalizedBeastMode[] = [];
    for (const dsId of datasetIds) {
      try {
        const ds = await this.datasets.get(dsId);
        if (ds.name) datasetNames.push(ds.name);
      } catch {
        // skip on failure
      }
    }
    if (this.beastModes && datasetIds.length) {
      try {
        const bm = await this.beastModes.exportForDatasets({ datasetIds });
        beastModes = bm.datasets.flatMap((d) => d.beastModes);
      } catch {
        // skip on failure
      }
    }
    const context = buildCardContext({
      card,
      title: card.title ?? card.name ?? `Card ${cardId}`,
      type: card.type,
      datasetNames,
      beastModes,
    });
    return this.ai.chatCompletion({
      system: SYSTEM_TRANSLATE_CARD,
      user: context,
      temperature: 0.3,
      maxTokens: 800,
    });
  }

  private async resolvePage(
    opts: SemanticLayerOptions,
  ): Promise<{ pageId: string; pageName: string }> {
    if (opts.pageId) {
      const page = await this.pages.get(opts.pageId);
      return {
        pageId: String(page.id),
        pageName: page.name ?? page.title ?? `Page ${page.id}`,
      };
    }
    if (opts.pageName) {
      const all = await this.pages.listAll();
      const exact = all.find((p) => (p.name ?? p.title) === opts.pageName);
      if (exact) {
        return {
          pageId: String(exact.id),
          pageName: (exact.name ?? exact.title) as string,
        };
      }
      const target = opts.pageName.toLowerCase();
      const fuzzy = all.find((p) => (p.name ?? p.title ?? "").toLowerCase().includes(target));
      if (!fuzzy) throw new Error(`No page found matching name: ${opts.pageName}`);
      return {
        pageId: String(fuzzy.id),
        pageName: (fuzzy.name ?? fuzzy.title) as string,
      };
    }
    throw new Error("generate requires either pageId or pageName.");
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function buildCardContext(opts: {
  card: DomoCard;
  title: string;
  type: string | undefined;
  datasetNames: string[];
  beastModes: NormalizedBeastMode[];
}): string {
  const parts: string[] = [
    `Card Name: ${opts.title}`,
    `Chart Type: ${opts.type ?? "Unknown"}`,
    `Source Dataset(s): ${opts.datasetNames.join(", ") || "Unknown"}`,
  ];
  if (opts.beastModes.length) {
    const bmLines = opts.beastModes
      .slice(0, 30)
      .map((bm) => `  - ${bm.name} (${bm.dataType ?? "?"}):\n    ${bm.expression ?? ""}`);
    parts.push(`Calculations (Beast Modes):\n${bmLines.join("\n")}`);
  }
  const desc = (opts.card as Record<string, unknown>).description;
  if (typeof desc === "string" && desc.length) {
    parts.push(`Card Description: ${desc}`);
  }
  return parts.join("\n");
}
