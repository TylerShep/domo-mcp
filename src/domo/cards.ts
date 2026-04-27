import type { DomoCard } from "../types/domo.js";
import type { DomoClient } from "./client.js";

const DEFAULT_PAGE_LIMIT = 50;

export interface CardListFilters {
  page?: string;
  tags?: string[];
  excludeTags?: string[];
}

export interface CardSummary {
  cardId: string;
  cardUrn: string | undefined;
  title: string;
  pageId: string | undefined;
  pageName: string | undefined;
  type: string | undefined;
  tags: string[];
  datasourceIds: string[];
}

export class CardsApi {
  constructor(private readonly client: DomoClient) {}

  async list(opts: CardListFilters & { limit?: number } = {}): Promise<CardSummary[]> {
    const all = await this.client.paginate<DomoCard>({
      host: "platform",
      path: "/v1/cards",
      limit: DEFAULT_PAGE_LIMIT,
    });
    return all
      .map(toSummary)
      .filter((c) => matchesFilters(c, opts))
      .slice(0, opts.limit ?? 1000);
  }

  async get(cardId: string | number): Promise<DomoCard> {
    return this.client.request<DomoCard>({
      host: "platform",
      path: `/v1/cards/${encodeURIComponent(String(cardId))}`,
    });
  }

  /**
   * Render a card as a PNG. Returns base64-encoded image bytes plus content
   * type, suitable for the MCP `image` content block.
   *
   * Ported from domo-slack-ext-reporting/app/engines/rest.py:generate_card_image.
   */
  async renderPng(opts: {
    cardId: string | number;
    width?: number;
    height?: number;
  }): Promise<{ base64: string; contentType: string; bytes: number }> {
    const { bytes, contentType } = await this.client.requestBytes({
      host: "platform",
      method: "POST",
      path: `/v1/cards/${encodeURIComponent(String(opts.cardId))}/render`,
      body: {
        format: "png",
        width: opts.width ?? 1100,
        height: opts.height ?? 700,
      },
      accept: "image/png",
    });
    return {
      base64: Buffer.from(bytes).toString("base64"),
      contentType: contentType.startsWith("image/") ? contentType : "image/png",
      bytes: bytes.byteLength,
    };
  }
}

function toSummary(raw: DomoCard): CardSummary {
  const firstPage = raw.pages?.[0];
  return {
    cardId: String(raw.id),
    cardUrn: raw.cardUrn ?? raw.urn,
    title: raw.title ?? raw.name ?? "",
    pageId: firstPage ? String(firstPage.id) : undefined,
    pageName: firstPage?.title ?? firstPage?.name,
    type: raw.type,
    tags: raw.tags ?? [],
    datasourceIds: (raw.datasources ?? [])
      .map((d) => d.id)
      .filter((id): id is string => Boolean(id)),
  };
}

function matchesFilters(card: CardSummary, filters: CardListFilters): boolean {
  if (filters.page && card.pageName !== filters.page) return false;
  if (filters.tags?.length) {
    const set = new Set(card.tags);
    if (!filters.tags.every((t) => set.has(t))) return false;
  }
  if (filters.excludeTags?.length) {
    if (filters.excludeTags.some((t) => card.tags.includes(t))) return false;
  }
  return true;
}
