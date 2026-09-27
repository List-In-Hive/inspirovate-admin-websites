// Stable request text keeps replay of the same paid generation idempotent.
export const AUTOMATIC_TOPIC = 'Choose and write the next useful article for this project using its saved content strategy, verified knowledge and article history. No manual topic selection is required.';

export function automaticTopic(publishAt?: string) {
  return publishAt ? `${AUTOMATIC_TOPIC} Target publication date: ${publishAt}. The date is context, not a requirement to write a seasonal article.` : AUTOMATIC_TOPIC;
}

export const CONTENT_SELECTION_RULES = `Use the saved project goals, contentAreas and editorialRules as editorial preferences, subject to the factual and safety constraints above. For an automatic assignment, select one specific reader question with a clear practical benefit before writing. Look at the recent catalog and related drafts as well as published articles. Prefer an under-covered area relevant to the business, vary reader needs and article formats over successive publications, and do not rewrite an existing article under a different title. Evergreen topics are the default; seasonal content is optional only when it is useful and justified by known project context. Never infer a business location or hemisphere from the publication time zone. Do not invent search volumes, keyword research, trends or current events. Base topic selection on supplied project knowledge and reader needs. A manual revision must preserve the current article's intent unless the editing request asks to change it.`;
