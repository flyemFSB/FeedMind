import { z } from "zod";

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).default({}),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export type ApiEnvelope<T> = {
  data: T | null;
  error?: ApiError | null;
};

export function apiEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    data: dataSchema.nullable(),
    error: apiErrorSchema.nullable().optional(),
  });
}
