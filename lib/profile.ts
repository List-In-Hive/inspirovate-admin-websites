import { z } from "zod";
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(150),
  facts: z.string().trim().min(1).max(6000),
  audience: z.string().trim().min(1).max(1500),
  tone: z.string().trim().min(1).max(1000),
  goals: z.string().trim().min(1).max(3000).default('Help readers make informed choices, build trust in the business and encourage relevant enquiries without sales pressure.'),
  contentAreas: z.string().trim().min(1).max(5000).default('Derive a varied set of useful content areas from the verified business facts and audience. Cover practical questions, decisions, comparisons, common mistakes and useful guides.'),
  editorialRules: z.string().trim().min(1).max(3000).default('Prefer useful evergreen advice. Use seasonal angles only when relevant to this business and supported by its known market. Do not assume location, climate, holidays, stock or special offers. Avoid repeating the same reader question or advice under a different title.'),
});
export type Profile = z.infer<typeof profileSchema>;
export const defaultProfile: Profile = profileSchema.parse({
  name: "Petal & Stem",
  facts: "Flower website with bouquet and event enquiry pages. Available links: /flowers and /contact. Do not invent location, prices, delivery areas, opening hours, customer reviews or guarantees.",
  audience: "English-speaking readers choosing flowers for gifts, their home or small gatherings.",
  tone: "Warm, practical, tasteful. Plain English, useful specific advice, no hype.",
  contentAreas: 'Choosing bouquets; flowers in the home; thoughtful flower gifts; flower care; arrangements for gatherings. Develop distinct practical reader questions within these areas rather than repeating introductory guides.',
});
