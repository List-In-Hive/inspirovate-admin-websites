import { z } from 'zod';
import type { Profile } from './profile';

// Draft preferences remain separate until the administrator applies all rules.
export const blogSettingsSchema = z.object({
  name: z.string().trim().min(1).max(150),
  facts: z.string().trim().min(1).max(6000),
  photoCount: z.number().int().min(1).max(6).default(2),
  externalLinkCount: z.number().int().min(0).max(10).default(3),
  internalLinkCount: z.number().int().min(0).max(10).default(3),
  audience: z.string().trim().min(1).max(1500),
  tone: z.string().trim().min(1).max(1000),
  goals: z.string().trim().min(1).max(3000),
  contentAreas: z.string().trim().min(1).max(5000),
  editorialRules: z.string().trim().min(1).max(3000),
});
export type BlogSettings = z.infer<typeof blogSettingsSchema>;
export function defaultBlogSettings(profile: Profile): BlogSettings {
  return blogSettingsSchema.parse(profile);
}
export const saveBlogSettingsSql = `UPDATE inspirovate.profile
  SET payload=jsonb_set(payload,'{blogSettingsDraft}',$1::jsonb,true) WHERE id=$2`;
// Preserve the separate draft when the existing project setup form is saved.
export const saveProfileSql = `UPDATE inspirovate.profile SET payload=payload || $1::jsonb WHERE id=$2`;
