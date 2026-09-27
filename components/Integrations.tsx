"use client";
import { useEffect, useState } from "react";
import { Title } from "react-admin";
import { Alert, Box, Button, Card, CardContent, Chip, Stack, TextField, Typography } from "@mui/material";
import { useCatalog } from "./ProjectCatalog";
import { api as globalApi } from "./dataProvider";
import { useProject } from "./ProjectContext";
import type { Profile } from "@/lib/profile";

type Status = { database: string; databaseError?: string; openai: string; openaiError?: string; model: string };
export default function Integrations() {
  const {api,project}=useProject();const {reload:reloadCatalog}=useCatalog();
  const [website,setWebsite]=useState(project.url);
  const [status, setStatus] = useState<Status>();
  const [profile, setProfile] = useState<Profile>();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api('/integrations'), api('/profile')]).then(([s,p])=>{setStatus(s.data);setProfile(p.data);}).catch(e=>setError(e.message));
  }, [api]);
  const check = async () => {
    setBusy(true);setError('');setMessage('');
    try { setStatus((await api('/integrations','POST',{})).data); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const recheck = async () => {setBusy(true);setError('');try{await globalApi(`/api/projects/${project.id}`,'PUT',{action:'recheck'});await reloadCatalog();setMessage('Repository checked. Review setup before enabling automatic blogging.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const save = async () => {
    setBusy(true);setError('');setMessage('');
    try { await api('/profile','PUT',profile);if(project.setup?.compatible){await globalApi(`/api/projects/${project.id}`,'PUT',{action:'review',url:website});await reloadCatalog();}setMessage('Project setup saved. Future articles will use this strategy automatically.'); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <Box p={{xs:2,md:3}} maxWidth={1000}><Title title="Project settings" />
    <Typography variant="h4" mb={3}>Project settings</Typography>
    <Stack direction={{xs:'column',md:'row'}} gap={2} mb={2}>
      <Card sx={{flex:1}}><CardContent><Typography variant="h6">Supabase</Typography><Chip sx={{my:2}} label={!status?'Loading…':status.database==='connected'?'Connected':status?.database==='error'?'Connection error':'Local files'} color={status?.database==='connected'?'success':'default'} /><Typography variant="body2">Articles, revisions, approvals and AI history.</Typography>{status?.databaseError&&<Alert severity="error" sx={{mt:2}}>{status.databaseError}</Alert>}</CardContent></Card>
      <Card sx={{flex:1}}><CardContent><Typography variant="h6">OpenAI</Typography><Chip sx={{my:2}} label={!status?'Loading…':status.openai==='connected'?'Key verified':status?.openai==='configured'?'Key added — verification needed':status?.openai==='error'?'Connection error':'Key not configured'} color={status?.openai==='connected'?'success':'default'} /><Typography variant="body2">Model: {status?.model || '…'}</Typography>{status?.openaiError&&<Alert severity="error" sx={{mt:2}}>{status.openaiError}</Alert>}</CardContent></Card>
    </Stack>
    <Button variant="outlined" disabled={busy} onClick={check}>{busy?'Checking…':'Check connections'}</Button>
    <Typography variant="body2" color="text.secondary" mt={1} mb={3}>Checking the key does not generate content. The business profile below applies only to this project.</Typography>
    {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}{message&&<Alert severity="success" sx={{mb:2}}>{message}</Alert>}
    <Card><CardContent><Typography variant="h5" mb={1}>{project.brand}: ongoing content setup</Typography><Typography color="text.secondary" mb={3}>Set this up once for ongoing publication throughout the year. AI chooses individual topics from these goals, verified knowledge and previous articles. Update it only when your business or content direction changes. Include verified facts only.</Typography>
      {project.setup&&<Box mb={3}><Alert severity={project.setup.compatible?'info':'warning'}>{project.setup.reviewed?'Project setup reviewed.':'Review the detected facts and suggested strategy below before enabling automatic blogging.'} {project.setup.issues.join(' ')}</Alert><TextField label="Public website URL" fullWidth sx={{mt:2}} value={website} onChange={e=>setWebsite(e.target.value)} helperText="The live website address, for example https://your-site.netlify.app"/><Typography variant="body2" color="text.secondary" mt={2}>Analyzed repository: {project.repository} · Branch: {project.branch}. Imported source notes in Knowledge remain disabled until reviewed.</Typography>{project.setup.analyzedCommit&&<Typography variant="body2" color="text.secondary">Source version: {project.setup.analyzedCommit.slice(0,7)}</Typography>}<Button sx={{mt:2}} disabled={busy} onClick={recheck}>Recheck repository compatibility</Button></Box>}
      {profile&&<Stack spacing={2}>
        {([{key:'name',label:'Name',rows:1},{key:'facts',label:'Business facts and constraints',rows:5},{key:'audience',label:'Audience',rows:2},{key:'tone',label:'Writing style',rows:2},{key:'goals',label:'Blog goals',rows:3},{key:'contentAreas',label:'Content areas',rows:4},{key:'editorialRules',label:'Editorial rules and topics to avoid',rows:4}] as const).map(f=><TextField key={f.key} label={f.label} value={profile[f.key]??''} multiline minRows={f.rows} onChange={e=>setProfile({...profile,[f.key]:e.target.value})} />)}
        <Button variant="contained" onClick={save} disabled={busy||status?.database!=='connected'} sx={{alignSelf:'start'}}>{project.setup?.compatible&&!project.setup.reviewed?'Save and confirm project setup':'Save project setup'}</Button>
      </Stack>}
    </CardContent></Card>
  </Box>;
}
