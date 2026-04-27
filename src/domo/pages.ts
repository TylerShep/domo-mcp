import type { DomoPage } from "../types/domo.js";
import type { DomoClient } from "./client.js";

const DEFAULT_PAGE_LIMIT = 50;

export interface PageTreeNode {
  id: string;
  name: string;
  cardCount: number;
  children: PageTreeNode[];
}

export class PagesApi {
  constructor(private readonly client: DomoClient) {}

  async list(opts: { limit?: number; offset?: number } = {}): Promise<DomoPage[]> {
    return this.client.request<DomoPage[]>({
      host: "platform",
      path: "/v1/pages",
      query: {
        limit: opts.limit ?? DEFAULT_PAGE_LIMIT,
        offset: opts.offset ?? 0,
      },
    });
  }

  async listAll(): Promise<DomoPage[]> {
    return this.client.paginate<DomoPage>({
      host: "platform",
      path: "/v1/pages",
      limit: DEFAULT_PAGE_LIMIT,
    });
  }

  async get(pageId: string | number): Promise<DomoPage> {
    return this.client.request<DomoPage>({
      host: "platform",
      path: `/v1/pages/${encodeURIComponent(String(pageId))}`,
    });
  }

  async getCollections(pageId: string | number): Promise<unknown[]> {
    return this.client.request<unknown[]>({
      host: "platform",
      path: `/v1/pages/${encodeURIComponent(String(pageId))}/collections`,
    });
  }

  /**
   * Recursive page hierarchy starting from a root page (instance API).
   * Useful for understanding the structure of a complex dashboard suite.
   *
   * Uses the instance content API which requires DOMO_DEVELOPER_TOKEN
   * (or instance-scoped OAuth).
   */
  async getTree(opts: {
    rootPageId?: string | number;
    rootPageName?: string;
  }): Promise<PageTreeNode> {
    let rootId: string;
    let rootName: string;

    if (opts.rootPageId) {
      const page = await this.get(opts.rootPageId);
      rootId = String(page.id);
      rootName = page.name ?? page.title ?? `Page ${rootId}`;
    } else if (opts.rootPageName) {
      const all = await this.listAll();
      const match = all.find((p) => (p.name ?? p.title) === opts.rootPageName);
      if (!match) throw new Error(`No page found with name: ${opts.rootPageName}`);
      rootId = String(match.id);
      rootName = (match.name ?? match.title) as string;
    } else {
      throw new Error("getTree requires either rootPageId or rootPageName.");
    }

    return this.fetchTreeRecursive(rootId, rootName);
  }

  private async fetchTreeRecursive(pageId: string, pageName: string): Promise<PageTreeNode> {
    const detail = await this.client.request<{
      children?: Array<{ id: string | number; name?: string; title?: string }>;
      cards?: unknown[];
      cardIds?: unknown[];
    }>({
      host: "instance",
      path: `/api/content/v1/pages/${encodeURIComponent(pageId)}`,
      query: { parts: "children,cards" },
    });

    const cardCount = detail.cards?.length ?? detail.cardIds?.length ?? 0;
    const children: PageTreeNode[] = [];
    for (const child of detail.children ?? []) {
      const childName = child.name ?? child.title ?? `Page ${child.id}`;
      const subtree = await this.fetchTreeRecursive(String(child.id), childName);
      children.push(subtree);
    }

    return {
      id: pageId,
      name: pageName,
      cardCount,
      children,
    };
  }
}
