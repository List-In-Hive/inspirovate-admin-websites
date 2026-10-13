"use client";
import { useEffect,useState } from 'react';
import { Alert,Box,Button,Card,CardContent,Chip,Dialog,DialogActions,DialogContent,DialogTitle,Stack,TextField,Typography } from '@mui/material';
import { articleWordCount, editorialText, markdownAssets, normalizedLink, photoPaths } from '@/lib/article-format';
import { mediaId } from '@/lib/media-path';
import { useRefresh } from 'react-admin';
import Markdown from 'react-markdown';
import { useProject } from './ProjectContext';
import type { Article } from '@/lib/article';
import type { AITask,History,Media } from '@/lib/content-store';
import type { ReviewResult } from '@/lib/editorial';
export default function ArticlePreparation({article}:{article:Article}){
 const {api,project}=useProject();const refresh=useRefresh();const [tasks,setTasks]=useState<AITask[]>([]);const [versions,setVersions]=useState<History[]>([]);const [selected,setSelected]=useState<History>();const [allVersions,setAllVersions]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [instruction,setInstruction]=useState('');
 const [request,setRequest]=useState<{operation:string;id?:string}>();
 useEffect(()=>{Promise.all([api(`/articles/${article.id}/preparation`),api(`/articles/${article.id}/history`)]).then(([t,h])=>{setTasks(t.data);setVersions(h.data);}).catch(e=>setError(e.message));},[api,article.id,article.revision]);
 const review=tasks.find(t=>t.kind==='review'&&t.status==='complete');const report=review?.output as ReviewResult|undefined;
 const current=report&&report.article.title===article.title&&report.article.description===article.description&&editorialText(report.article.body,article.photos)===editorialText(article.body,article.photos)&&report.article.slug===article.slug;
 const linked=[...new Set(markdownAssets(article.body).links.map(v=>normalizedLink(v,project.url)))];
 const generatedPhotoCount=photoPaths(article).filter(path=>Boolean(mediaId(path))).length;
 const internalCount=linked.filter(v=>v.startsWith('/')).length;const externalCount=linked.filter(v=>v.startsWith('http')).length;
 const photos=tasks.filter(t=>t.kind==='photo');const photo=photos.find(t=>(t.output as Media)?.path===article.coverImage)?.output as Media|undefined;
 const run=async(operation:string,newPaid=false)=>{
  const next=request?.operation===operation?request:{operation,id:newPaid?crypto.randomUUID():undefined};setRequest(next);setBusy(true);setError('');
  try{await api(`/articles/${article.id}/${operation}`,'POST',{requestId:next.id,revision:article.revision,instruction});setRequest(undefined);refresh();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);refresh();}
 };
 const restore=async()=>{setBusy(true);setError('');try{await api(`/articles/${article.id}/restore`,'POST',{historyId:selected!.id,revision:article.revision});setSelected(undefined);refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <Stack gap={2} mb={3}>
 <Card variant="outlined"><CardContent><Typography variant="h6" mb={2}>Search preview</Typography><Typography variant="body2" color="text.secondary">{project.url}/blog/{article.slug}</Typography><Typography variant="h6" color="primary" mt={1}>{article.title}</Typography><Typography>{article.description}</Typography><Stack direction="row" gap={1} mt={2} flexWrap="wrap"><Chip size="small" label={`Title: ${article.title.length} characters`} /><Chip size="small" color={article.description.length>160?'warning':'default'} label={`Description: ${article.description.length} characters`} /><Chip size="small" label={`${articleWordCount(article.body)} words`} /></Stack>{article.format&&<Stack direction="row" gap={1} mt={2} flexWrap="wrap"><Chip color={generatedPhotoCount===article.format.photoCount?'default':'warning'} label={`Photos: ${generatedPhotoCount}/${article.format.photoCount}`}/><Chip label={`External links: ${externalCount}/${article.format.externalLinkCount}`}/><Chip label={`Internal links: ${internalCount}/${article.format.internalLinkCount}`}/></Stack>}
 <Typography variant="body2" color="text.secondary" mt={2}>Search engines may display a different title or snippet. The website provides a canonical URL and Article structured data.</Typography></CardContent></Card>
 <Card variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6">Editorial review</Typography><Chip label={!report?'Not reviewed':!current?'Text changed — review again':report.ready?'Ready':'Needs changes'} color={current&&report?.ready?'success':'default'} /></Stack>
 <Typography color="text.secondary" my={1}>AI checks project facts, related articles, clarity and links, then saves improvements as a new version. It does not independently verify sources on the internet.</Typography>
 {report&&!current&&<Alert severity="info" sx={{mt:2}}>This report describes an earlier text version. Its findings may already be resolved. The current draft has not been reviewed by AI yet.</Alert>}
 {report&&<Box mt={2}><Typography>{report.summary}</Typography>{report.changes.map((change,i)=><Typography key={i} variant="body2" mt={1}>• {change}</Typography>)}{current&&report.remainingIssues.map((issue,i)=><Alert key={i} severity={issue.severity==='blocker'?'warning':'info'} sx={{mt:1}}>{issue.message}</Alert>)}</Box>}
 {!article.commit&&<Button disabled={busy} onClick={()=>run('review',Boolean(review)||tasks.some(t=>t.kind==='review'))}>{busy?'Working…':'Review & improve with AI'}</Button>}
 </CardContent></Card>
 <Card variant="outlined"><CardContent><Typography variant="h6">Article photos</Typography><Typography color="text.secondary" my={1}>{article.format?`${article.format.photoCount} unique AI-generated photos, including the cover.`:'Photo count follows the project’s blog settings (this draft predates per-article settings).'} Optimized WebP, up to 1536 px wide, target 350 KB each. All photos are published with the article to this project’s Git repository.</Typography>
 {photo&&<Typography>{photo.width} × {photo.height} · {Math.round(photo.size/1024)} KB · {photo.model}</Typography>}
 {!article.commit&&<Stack gap={2} mt={2}><TextField label="Visual direction (optional)" value={instruction} onChange={e=>setInstruction(e.target.value)} disabled={busy||Boolean(request)} placeholder="Natural daylight, a simple setting, soft colours" /><Button sx={{alignSelf:'start'}} variant="outlined" disabled={busy} onClick={()=>run('photo',(article.photos?.length||0)>=(article.format?.photoCount||1))}>{busy?'Working…':(article.photos?.length||0)>=(article.format?.photoCount||1)?'Regenerate all photos (paid)':'Generate missing photos (paid)'}</Button></Stack>}
 </CardContent></Card>
 {error&&<Alert severity="error">{error}</Alert>}{request&&!busy&&<Button onClick={()=>setRequest(undefined)}>Start a different request</Button>}
 {tasks.filter(t=>t.status==='failed'||t.status==='running').slice(0,3).map(t=><Alert key={t.id} severity="warning">{t.kind==='photo'?'Photo':'Editorial'} request: {t.error||'A request was sent; its result has not been confirmed. It will not be charged again automatically.'}</Alert>)}
 <Card variant="outlined"><CardContent><Typography variant="h6" mb={1}>Version history</Typography><Typography color="text.secondary" mb={2}>Snapshots start when history was enabled. Restoring a draft creates a new version; previous versions stay available.</Typography><Stack direction="row" gap={1} flexWrap="wrap">{(allVersions?versions:versions.slice(0,20)).map(v=><Button key={v.id} onClick={()=>setSelected(v)}>v{v.revision} · {new Date(v.savedAt).toLocaleString('en-US')}</Button>)}</Stack>{versions.length>20&&<Button sx={{mt:1}} onClick={()=>setAllVersions(v=>!v)}>{allVersions?'Show latest 20':`Show all ${versions.length} versions`}</Button>}</CardContent></Card>
 <Dialog open={Boolean(selected)} onClose={()=>setSelected(undefined)} maxWidth="md" fullWidth><DialogTitle>Version {selected?.revision} · {selected?.payload.title}</DialogTitle><DialogContent><Typography color="text.secondary" mb={2}>{selected?.payload.description}</Typography><Markdown skipHtml components={{img:()=>null,a:({children})=><span>{children}</span>}}>{selected?.payload.body||''}</Markdown></DialogContent><DialogActions><Button onClick={()=>setSelected(undefined)}>Close</Button>{!article.commit&&<Button disabled={busy} onClick={restore}>Restore as new draft version</Button>}</DialogActions></Dialog>
 </Stack>;
}
