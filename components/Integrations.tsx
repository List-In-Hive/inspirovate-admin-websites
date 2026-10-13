"use client";
import { useEffect, useState } from "react";
import { Title } from "react-admin";
import { Alert, Box, Button, Card, CardContent, Chip, Stack, TextField, Typography } from "@mui/material";
import { useCatalog } from "./ProjectCatalog";
import { api as globalApi } from "./dataProvider";
import { useProject } from "./ProjectContext";


type Status = { database: string; databaseError?: string; openai: string; openaiError?: string; model: string; claude?: string; claudeError?: string; claudeModel?: string };
export default function Integrations() {
  const {api,project,base}=useProject();const {reload:reloadCatalog}=useCatalog();
  const [website,setWebsite]=useState(project.url);
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  useEffect(() => {
    api('/integrations').then(s=>setStatus(s.data)).catch(e=>setError(e.message));
  }, [api]);
  const check = async () => {
    setBusy(true);setError('');setMessage('');
    try { setStatus((await api('/integrations','POST',{})).data); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const recheck = async () => {setBusy(true);setError('');try{await globalApi(`/api/projects/${project.id}`,'PUT',{action:'recheck'});await reloadCatalog();setMessage('Repository checked. Review setup before enabling automatic blogging.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const save = async () => {
    setBusy(true);setError('');setMessage('');
    try { if(project.setup?.compatible){await globalApi(`/api/projects/${project.id}`,'PUT',{action:'review',url:website});await reloadCatalog();}setMessage('Website setup saved.'); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <Box p={{xs:2,md:3}} maxWidth={1000}><Title title="Project settings" />
    <Typography variant="h4" mb={3}>Project settings</Typography>
    <Stack direction={{xs:'column',md:'row'}} gap={2} mb={2}>
      <Card sx={{flex:1}}><CardContent><Typography variant="h6">Supabase</Typography><Chip sx={{my:2}} label={!status?'Loading…':status.database==='connected'?'Connected':status?.database==='error'?'Connection error':'Local files'} color={status?.database==='connected'?'success':'default'} /><Typography variant="body2">Articles, revisions, approvals and AI history.</Typography>{status?.databaseError&&<Alert severity="error" sx={{mt:2}}>{status.databaseError}</Alert>}</CardContent></Card>
      <Card sx={{flex:1}}><CardContent><Typography variant="h6">OpenAI</Typography><Chip sx={{my:2}} label={!status?'Loading…':status.openai==='connected'?'Key verified':status?.openai==='configured'?'Key added — verification needed':status?.openai==='error'?'Connection error':'Key not configured'} color={status?.openai==='connected'?'success':'default'} /><Typography variant="body2">Model: {status?.model || '…'}</Typography>{status?.openaiError&&<Alert severity="error" sx={{mt:2}}>{status.openaiError}</Alert>}</CardContent></Card>
      <Card sx={{flex:1}}><CardContent><Typography variant="h6">Claude (Anthropic)</Typography><Chip sx={{my:2}} label={!status?'Loading…':status.claude==='connected'?'Key verified':status?.claude==='configured'?'Key added — verification needed':status?.claude==='error'?'Connection error':'Key not configured — OpenAI writes alone'} color={status?.claude==='connected'?'success':'default'} /><Typography variant="body2">Model: {status?.claudeModel || '…'}</Typography>{status?.claudeError&&<Alert severity="error" sx={{mt:2}}>{status.claudeError}</Alert>}</CardContent></Card>
    </Stack>
    <Button variant="outlined" disabled={busy} onClick={check}>{busy?'Checking…':'Check connections'}</Button>
    <Typography variant="body2" color="text.secondary" mt={1} mb={3}>Checking the key does not generate content.</Typography>
    {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}{message&&<Alert severity="success" sx={{mb:2}}>{message}</Alert>}
    <Card><CardContent><Typography variant="h5" mb={1}>Website & repository</Typography><Typography color="text.secondary" mb={2}>Manage this project’s website address and publishing connection.</Typography><Button href={`#${base}/blog-settings`} sx={{mb:2}}>Edit blog rules & business information</Button>
      {project.setup&&<Box mb={3}><Alert severity={project.setup.compatible?'info':'warning'}>{project.setup.reviewed?'Project setup reviewed.':'Review the business information in Blog rules & settings before confirming setup and enabling automatic blogging.'} {project.setup.issues.join(' ')}</Alert><TextField label="Public website URL" fullWidth sx={{mt:2}} value={website} onChange={e=>setWebsite(e.target.value)} helperText="The live website address, for example https://your-site.netlify.app"/><Typography variant="body2" color="text.secondary" mt={2}>Analyzed repository: {project.repository} · Branch: {project.branch}. Imported source notes in Knowledge remain disabled until reviewed.</Typography>{project.setup.analyzedCommit&&<Typography variant="body2" color="text.secondary">Source version: {project.setup.analyzedCommit.slice(0,7)}</Typography>}<Button sx={{mt:2}} disabled={busy} onClick={recheck}>Recheck repository compatibility</Button></Box>}
      {project.setup?.compatible&&<Button variant="contained" onClick={save} disabled={busy||status?.database!=='connected'}>{project.setup.reviewed?'Save website settings':'Confirm website setup'}</Button>}

    </CardContent></Card>
  </Box>;
}
