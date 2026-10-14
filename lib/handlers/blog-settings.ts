import { getSite } from '../config';
import { query } from '../database';
import { readProfile } from '../postgres-store';
import { blogSettingsSchema, defaultBlogSettings, saveBlogSettingsSql } from '../blog-settings';
import { json, readBody } from '../http';
import { withLock } from '../store';
import { repositorySnapshot } from '../github-source';
import { readStyleSamples, suggestVisualStyle } from '../visual-style';

export async function GET() {
  const row = (await query("SELECT payload->'blogSettingsDraft' AS draft FROM inspirovate.profile WHERE id=$1", [getSite().id])).rows[0];
  const defaults = defaultBlogSettings(await readProfile());
  return json({data: blogSettingsSchema.parse({...defaults,...row?.draft}), active:defaults});
}
export async function PUT(request: Request) {
  const data = blogSettingsSchema.parse(await readBody(request));
  await withLock(async () => {
    const apply=new URL(request.url).searchParams.get('apply')==='true';
    const sql=apply?`UPDATE inspirovate.profile SET payload=payload || $1::jsonb || jsonb_build_object('blogSettingsDraft',$1::jsonb) WHERE id=$2`:saveBlogSettingsSql;
    const result = await query(sql, [JSON.stringify(data), getSite().id]);
    if (result.rowCount !== 1) throw new Error('Project profile not found.');
  });
  return json({data});
}
// One small paid request: describes the website's own images so new photos match them. Nothing is saved.
export async function suggestStyle() {
  const snapshot = await repositorySnapshot(`https://github.com/${getSite().repository}`);
  const samples = await readStyleSamples(snapshot);
  const visual = await suggestVisualStyle(samples);
  return json({data: visual, samples: samples.map(s => s.path)});
}
