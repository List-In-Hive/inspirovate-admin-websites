"use client";
import { useEffect, useState } from "react";
import { Title } from "react-admin";
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { useProject } from "./ProjectContext";
import type { Generation } from "@/lib/postgres-store";

type Job = Omit<Generation,'output'> & { outputAvailable: boolean };
const labels = {generating:'Request sent',generated:'Content ready',succeeded:'Draft saved',failed:'Needs attention'};
export default function AIGenerator() {
  const {api,project,base}=useProject();
  const covers=project.covers;
  const cover=covers[0].id;
  const [id,setId]=useState(()=>crypto.randomUUID()); const [attempted,setAttempted]=useState(false);
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [articleId,setArticleId]=useState('');
  const [loaded,setLoaded]=useState(false);
  const [jobs,setJobs]=useState<Job[]>([]); const [ready,setReady]=useState(false); const [model,setModel]=useState('');
  const reload=async()=>setJobs((await api('/generations')).data);
  useEffect(()=>{
    Promise.all([api('/integrations'),api('/generations')]).then(([s,g])=>{
      setReady(s.data.database==='connected'&&['configured','connected'].includes(s.data.openai));setModel(s.data.model);setJobs(g.data);
    }).catch(e=>setError(e.message)).finally(()=>setLoaded(true));
  },[api]);
  const run=async(job?:Job)=>{
    setBusy(true);setError('');setArticleId('');if(!job)setAttempted(true);
    try {
      const data=job?{id:job.id,topic:job.topic,coverImage:job.coverImage,coverAlt:job.coverAlt}:{id,coverImage:cover,coverAlt:covers.find(c=>c.id===cover)!.alt};
      const result=await api('/generations','POST',data);setArticleId(result.data.id);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);await reload().catch(()=>{});}
  };
  return <Box p={{xs:2,md:3}} maxWidth={1100}><Title title="Create with AI" />
    <Typography variant="h4" mb={1}>Create the next article</Typography><Typography color="text.secondary" mb={3}>AI chooses a useful new topic for {project.brand} from the saved project strategy, verified knowledge and previous articles. You do not need to choose a topic.</Typography>
    {loaded&&!ready&&<Alert severity="info" sx={{mb:2}}>First set up Supabase and OpenAI in <a href={`#${base}/settings`}>Settings</a>.</Alert>}
    <Card><CardContent><Stack spacing={2}>
      <Typography>Set up the project once in <a href={`#${base}/settings`}>Settings</a>. Scheduled articles use the same strategy automatically throughout the year. This button creates an additional draft now.</Typography>

      <Typography variant="body2" color="text.secondary">Model: {model||'…'} · Includes paid writing, editorial review and one AI photo. The result is saved as a draft; unresolved editorial issues appear on the review page.</Typography>
      <Stack direction="row" gap={2} flexWrap="wrap">
        <Button variant="contained" disabled={!ready||busy||attempted} onClick={()=>run()}>{busy?'Preparing your draft…':'Create next article'}</Button>
        {attempted&&<Button disabled={busy} onClick={()=>{setId(crypto.randomUUID());setAttempted(false);setArticleId('');setError('');}}>New request</Button>}
      </Stack>
      {busy&&<Alert severity="info">Writing, editorial review and photo generation can take several minutes. Failed requests are not retried automatically.</Alert>}
      {error&&<Alert severity="error">{error}</Alert>}
      {articleId&&<Alert severity="success">Draft saved. <a href={`#${base}/articles/${articleId}/show`}>Open and review the article →</a></Alert>}
    </Stack></CardContent></Card>
    <Stack direction="row" justifyContent="space-between" alignItems="center" mt={4} mb={2}><Typography variant="h5">Recent generations</Typography><Button onClick={()=>reload().catch(e=>setError(e.message))} disabled={busy}>Refresh</Button></Stack>
    {jobs.length===0&&<Typography color="text.secondary">Request results and token usage will appear here.</Typography>}
    <Stack gap={2}>{jobs.map(j=><Card key={j.id} variant="outlined"><CardContent>
      <Stack direction="row" justifyContent="space-between" gap={2}><Typography fontWeight={600}>{j.topic}</Typography><Chip size="small" label={labels[j.status]} /></Stack>
      <Typography variant="body2" color="text.secondary" mt={1}>{new Date(j.createdAt).toLocaleString('en-US')} · {j.model} · Tokens: {j.inputTokens??'—'} input / {j.outputTokens??'—'} output</Typography>
      {j.error&&<Alert severity="warning" sx={{mt:1}}>{j.error}</Alert>}
      {j.status==='generating'&&<Typography variant="body2" mt={1}>If the request was interrupted, check the OpenAI logs first. A new request may incur another charge.</Typography>}
      {j.articleId&&<Button href={`#${base}/articles/${j.articleId}/show`}>Open draft</Button>}
      {j.kind!=='revision'&&j.outputAvailable&&!j.articleId&&<Button onClick={()=>run(j)} disabled={busy}>Save existing content without generating again</Button>}
    </CardContent></Card>)}</Stack>
  </Box>;
}
