import { z } from "zod";

export const DomoDatasetSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    rows: z.number().optional(),
    columns: z.number().optional(),
    schema: z
      .object({
        columns: z.array(
          z.object({
            type: z.string(),
            name: z.string(),
            id: z.string().optional(),
            visible: z.boolean().optional(),
          }),
        ),
      })
      .optional(),
    owner: z
      .object({
        id: z.union([z.string(), z.number()]),
        name: z.string().optional(),
      })
      .partial()
      .optional(),
    dataCurrentAt: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type DomoDataset = z.infer<typeof DomoDatasetSchema>;

export const DomoPageSummarySchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

export const DomoCardSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    cardUrn: z.string().optional(),
    urn: z.string().optional(),
    pages: z.array(DomoPageSummarySchema).optional(),
    tags: z.array(z.string()).optional(),
    datasources: z.array(z.object({ id: z.string() }).passthrough()).optional(),
  })
  .passthrough();
export type DomoCard = z.infer<typeof DomoCardSchema>;

export interface DomoPage {
  id: string | number;
  name?: string;
  title?: string;
  parentId?: string | number;
  cardIds?: Array<string | number>;
  children?: DomoPage[];
  [k: string]: unknown;
}

export const DomoPageSchema: z.ZodType<DomoPage> = z.lazy(() =>
  z
    .object({
      id: z.union([z.string(), z.number()]),
      name: z.string().optional(),
      title: z.string().optional(),
      parentId: z.union([z.string(), z.number()]).optional(),
      cardIds: z.array(z.union([z.string(), z.number()])).optional(),
      children: z.array(DomoPageSchema).optional(),
    })
    .passthrough(),
);

export const DomoUserSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    email: z.string().optional(),
    name: z.string().optional(),
    role: z.string().optional(),
    title: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type DomoUser = z.infer<typeof DomoUserSchema>;

export const DomoGroupSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    name: z.string().optional(),
    type: z.string().optional(),
    active: z.boolean().optional(),
    creatorId: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();
export type DomoGroup = z.infer<typeof DomoGroupSchema>;

export const DomoOAuthTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
});
export type DomoOAuthTokenResponse = z.infer<typeof DomoOAuthTokenResponseSchema>;

export type AuthStrategy = "developer-token" | "oauth-bearer" | "browser-session";

export type DomoHost = "platform" | "instance";
