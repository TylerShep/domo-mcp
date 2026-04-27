import type { DomoUser } from "../types/domo.js";
import type { DomoClient } from "./client.js";

const DEFAULT_PAGE_LIMIT = 50;

export class UsersApi {
  constructor(private readonly client: DomoClient) {}

  async list(opts: { limit?: number; offset?: number } = {}): Promise<DomoUser[]> {
    return this.client.request<DomoUser[]>({
      host: "platform",
      path: "/v1/users",
      query: {
        limit: opts.limit ?? DEFAULT_PAGE_LIMIT,
        offset: opts.offset ?? 0,
      },
    });
  }

  async listAll(): Promise<DomoUser[]> {
    return this.client.paginate<DomoUser>({
      host: "platform",
      path: "/v1/users",
      limit: DEFAULT_PAGE_LIMIT,
    });
  }

  async get(userId: string | number): Promise<DomoUser> {
    return this.client.request<DomoUser>({
      host: "platform",
      path: `/v1/users/${encodeURIComponent(String(userId))}`,
    });
  }

  async whoami(): Promise<DomoUser> {
    return this.client.request<DomoUser>({
      host: "platform",
      path: "/v1/users/me",
    });
  }
}
