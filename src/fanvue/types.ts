import { z } from 'zod';

export const mediaVariantSchema = z.object({
  type: z.string(),
  url: z.string().url(),
  width: z.number().optional(),
  height: z.number().optional(),
  lengthMs: z.number().optional(),
  sizeBytes: z.number().optional(),
});

export const mediaTagsSchema = z
  .object({
    isNsfw: z.boolean().optional(),
    categories: z.array(z.string()).optional(),
  })
  .partial()
  .passthrough();

export const mediaSchema = z
  .object({
    uuid: z.string(),
    type: z.string().optional(),
    mimeType: z.string().optional(),
    createdAt: z.string().optional(),
    tags: mediaTagsSchema.optional(),
    variants: z.array(mediaVariantSchema).optional(),
  })
  .passthrough();

export const mediaListSchema = z
  .object({
    data: z.array(mediaSchema),
    pagination: z
      .object({ page: z.number().optional(), size: z.number().optional(), total: z.number().optional() })
      .partial()
      .optional(),
  })
  .passthrough();

export type Media = z.infer<typeof mediaSchema>;
export type MediaVariant = z.infer<typeof mediaVariantSchema>;

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().default(''),
  expires_in: z.number().default(3600),
  scope: z.string().default(''),
  token_type: z.string().optional(),
  id_token: z.string().optional(),
});

/** Thrown when Fanvue rejects the creator's grant: uninstall, revocation, or expiry. */
export class UnauthorizedError extends Error {
  constructor(message = 'Fanvue returned 401; the creator grant is gone') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class FanvueApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`Fanvue API ${status} on ${path}`);
    this.name = 'FanvueApiError';
  }
}
