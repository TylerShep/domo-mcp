import type { DomoGroup } from "../types/domo.js";
import type { DomoClient } from "./client.js";

const DEFAULT_PAGE_LIMIT = 50;

export class GroupsApi {
  constructor(private readonly client: DomoClient) {}

  async list(opts: { limit?: number; offset?: number } = {}): Promise<DomoGroup[]> {
    return this.client.request<DomoGroup[]>({
      host: "platform",
      path: "/v1/groups",
      query: {
        limit: opts.limit ?? DEFAULT_PAGE_LIMIT,
        offset: opts.offset ?? 0,
      },
    });
  }

  async listAll(): Promise<DomoGroup[]> {
    return this.client.paginate<DomoGroup>({
      host: "platform",
      path: "/v1/groups",
      limit: DEFAULT_PAGE_LIMIT,
    });
  }

  async get(groupId: string | number): Promise<DomoGroup> {
    return this.client.request<DomoGroup>({
      host: "platform",
      path: `/v1/groups/${encodeURIComponent(String(groupId))}`,
    });
  }
}
