"use client";
import { useEffect,useState } from 'react';
import { Alert,Box,Button,Card,CardContent,Chip,Dialog,DialogTitle,DialogContent,DialogActions,FormControlLabel,Stack,Switch,TextField,Typography } from '@mui/material';
import { Title } from 'react-admin';
import { useProject } from './ProjectContext';
import type { Knowledge as Entry } from '@/lib/content-store';
export default function Knowledge(){
 const {api,project}=useProject();const [entries,setEntries]=useState<Entry[]>([]);const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 const [editing,setEditing]=useState<Partial<Entry>>();
 const reload=async()=>setEntries((await api('/knowledge')).data);
 useEffect(()=>{api('/knowledge').then(r=>setEntries(r.data)).catch(e=>setError(e.message));},[api]);
 const run=async(work:()=>Promise<void>)=>{setBusy(true);setError('');setMessage('');try{await work();await reload();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <Box p={{xs:2,md:3}}><Title title={`${project.name} · Knowledge`} /><Typography variant="h4" mb={1}>Project knowledge</Typography>
 <Typography color="text.secondary" mb={3}>Verified facts, services, FAQs, examples and writing constraints for {project.brand}. AI uses enabled entries along with the business profile and past articles.</Typography>
 <Stack direction="row" gap={2} mb={2}><Button variant="contained" onClick={()=>setEditing({title:'',content:'',url:'',enabled:true})}>Add knowledge</Button><Button disabled={busy} onClick={()=>run(async()=>{const {data}=await api('/knowledge/import','POST',{});setMessage(`${data.count} pages imported or updated. Review and enable them before AI uses them.${data.errors.length?` Could not import: ${data.errors.join(', ')}`:''}`);})}>{busy?'Importing…':'Import website pages'}</Button></Stack>
 <Alert severity="info" sx={{mb:2}}>Imported pages start disabled. Check their facts and enable the entries you want AI to use. Changed pages require review again after importing.</Alert>
 {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}{message&&<Alert severity="success" sx={{mb:2}}>{message}</Alert>}
 <Stack gap={2}>{entries.map(item=><Card key={item.id}><CardContent><Stack direction="row" justifyContent="space-between" gap={2}><Typography variant="h6">{item.title}</Typography><Chip label={item.enabled?'Used by AI':'Disabled'} color={item.enabled?'success':'default'} /></Stack><Typography variant="body2" color="text.secondary" my={1}>{item.url||'Admin note'} · Updated {new Date(item.updatedAt).toLocaleString('en-US')}</Typography><Typography sx={{whiteSpace:'pre-wrap'}}>{item.content.slice(0,500)}{item.content.length>500?'…':''}</Typography><Button onClick={()=>setEditing(item)} sx={{mt:1}}>Review / edit</Button></CardContent></Card>)}</Stack>
 {!entries.length&&!busy&&<Typography color="text.secondary">Add business facts or import the project website to get started.</Typography>}
 <Dialog open={Boolean(editing)} onClose={()=>setEditing(undefined)} maxWidth="md" fullWidth><DialogTitle>Knowledge entry</DialogTitle><DialogContent><Stack gap={2} mt={1}><TextField label="Title" value={editing?.title||''} onChange={e=>setEditing({...editing,title:e.target.value})} /><TextField label="Source URL (optional)" value={editing?.url||''} onChange={e=>setEditing({...editing,url:e.target.value})} /><TextField multiline minRows={12} label="Verified information" value={editing?.content||''} onChange={e=>setEditing({...editing,content:e.target.value})} /><FormControlLabel label="Facts reviewed — use this entry in AI writing" control={<Switch checked={Boolean(editing?.enabled)} onChange={e=>setEditing({...editing,enabled:e.target.checked})} />} /></Stack></DialogContent><DialogActions><Button onClick={()=>setEditing(undefined)}>Cancel</Button><Button disabled={busy||!editing?.title||!editing?.content} onClick={()=>run(async()=>{await api('/knowledge',editing?.id?'PUT':'POST',editing);setEditing(undefined);})}>Save</Button></DialogActions></Dialog>
 </Box>;
}
