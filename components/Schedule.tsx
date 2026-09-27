"use client";
import { useEffect, useState } from 'react';
import { Title, useGetList } from 'react-admin';
import { Alert,Box,Button,Card,CardContent,Chip,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,MenuItem,Stack,Switch,TextField,Typography } from '@mui/material';
import { useCatalog } from './ProjectCatalog';
import { useProject } from './ProjectContext';
import { browserTimeZone, localDateTime as format, zonedInput } from '@/lib/calendar';
import type { Slot,ScheduleSettings } from '@/lib/schedule-store';
import type { Article } from '@/lib/article';
import BlogThumbnail from './BlogThumbnail';
const labels={planned:'Scheduled',review:'Ready for review',publishing:'Publishing',published:'Published',error:'Needs attention'};
export default function Schedule(){
  const timeZone=browserTimeZone();
  const {api,project,base}=useProject();const {reload:reloadCatalog}=useCatalog();
  const {data:articles=[],refetch:reloadArticles}=useGetList<Article>(`projects/${project.id}/articles`,{pagination:{page:1,perPage:1000},sort:{field:'updatedAt',order:'DESC'},filter:{}});
  const articlesById=new Map(articles.map(article=>[article.id,article]));
  const [config,setConfig]=useState<ScheduleSettings>({perMonth:4,enabled:true,latePolicy:'review24h'});
  const [slots,setSlots]=useState<Slot[]>([]);const [configured,setConfigured]=useState<boolean>();const [workerActive,setWorkerActive]=useState(false);const [heartbeat,setHeartbeat]=useState<string>();
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  const [editing,setEditing]=useState<Slot>();const [localTime,setLocalTime]=useState('');
  const reload=async()=>{const {data}=await api('/schedule');setConfigured(data.configured);if(data.configured){setConfig(data.settings);setSlots(data.slots);setHeartbeat(data.heartbeat);setWorkerActive(Boolean(data.workerActive));}await reloadArticles();};
  useEffect(()=>{api('/schedule').then(({data})=>{setConfigured(data.configured);if(data.configured){setConfig(data.settings);setSlots(data.slots);setHeartbeat(data.heartbeat);setWorkerActive(Boolean(data.workerActive));}}).catch(e=>setError(e.message));},[api]);
  const run=async(work:()=>Promise<unknown>)=>{setBusy(true);setError('');setMessage('');try{await work();await reload();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const edit=(slot:Slot)=>{setEditing(slot);setLocalTime(zonedInput(slot.publishAt,timeZone));};
  const saveDate=()=>run(async()=>{await api(`/schedule/${editing!.id}`,'PUT',{revision:editing!.revision,localTime,timeZone});setEditing(undefined);});
  const generate=(slot:Slot)=>run(async()=>{const {data}=await api(`/schedule/${slot.id}/generate`,'POST',{retry:slot.status==='error'});setMessage(`Draft ready. Open the article to review it.`);window.location.hash=`${base}/articles/${data.id}/show`;});
  if(configured===undefined && !error)return <Box p={3}><Typography>Loading project calendar…</Typography></Box>;
  return <Box p={{xs:2,md:3}} maxWidth={1200}><Title title="Publication calendar" />
    <Typography variant="h4" mb={1}>Publication calendar</Typography>
    <Typography color="text.secondary" mb={3}>{project.brand} · Times shown in your local time zone ({timeZone}). AI prepares content 24 hours before publication, then the server publishes the latest saved version on schedule.</Typography>
    {!configured&&<Alert severity="info" sx={{mb:2}}>First connect Supabase in <a href={`#${base}/settings`}>Settings</a>.</Alert>}
    <Card><CardContent><Stack gap={2}>
      <Stack direction={{xs:'column',sm:'row'}} spacing={2} alignItems="center">
        <TextField type="number" label="Articles per month" value={config.perMonth} onChange={e=>setConfig({...config,perMonth:Number(e.target.value)})} inputProps={{min:1,max:28}} />
        <FormControlLabel control={<Switch checked={config.enabled} onChange={e=>setConfig({...config,enabled:e.target.checked})} />} label="Automatic generation and publication" />
      </Stack>
      <TextField select label="If the draft is generated late" value={config.latePolicy} onChange={e=>setConfig({...config,latePolicy:e.target.value as ScheduleSettings['latePolicy']})}>
        <MenuItem value="review24h">Allow 24 hours for review and postpone publication</MenuItem><MenuItem value="immediate">Keep the date; publish immediately if overdue</MenuItem>
      </TextField>
      <Typography variant="body2" color="text.secondary">Your saved frequency continues across months and years without monthly setup. Topics are chosen automatically. New dates are evenly spaced throughout the month at 8:00 AM Pacific Time (Los Angeles), displayed in your local time zone. Manually adjusted dates and existing drafts are preserved. Past dates are skipped when creating a new calendar.</Typography>
      <Button disabled={!configured||busy} variant="contained" sx={{alignSelf:'start'}} onClick={()=>run(async()=>{await api('/schedule','PUT',config);await reloadCatalog();setMessage('Schedule saved.');})}>Save settings</Button>
    </Stack></CardContent></Card>
    <Alert severity={workerActive?'success':'info'} sx={{my:2}}>{workerActive?'The server scheduler is responding.':heartbeat?'The scheduler has not reported recently. Check GitHub Actions.':'The server scheduler has not run yet. Configure GitHub Actions secrets after pushing the code.'}{heartbeat&&` Last check: ${format(heartbeat)} (${timeZone}).`} Actual publication may be delayed by the GitHub Actions queue and the Netlify build.</Alert>
    {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}{message&&<Alert severity="success" sx={{mb:2}}>{message}</Alert>}
    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}><Typography variant="h5">This month and next month</Typography><Button disabled={busy} onClick={()=>run(async()=>{})}>Refresh</Button></Stack>
    <Stack gap={2}>{slots.map(slot=><Card key={slot.id} variant="outlined"><CardContent>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={2}>
        <Stack direction={{xs:'column',sm:'row'}} gap={2} sx={{minWidth:0}}>
          {slot.articleId&&<BlogThumbnail coverImage={articlesById.get(slot.articleId)?.coverImage} coverAlt={articlesById.get(slot.articleId)?.coverAlt} />}
          <Box><Typography variant="h6">{format(slot.publishAt)} · {timeZone}</Typography><Typography color="text.secondary">AI generation: {format(slot.generateAt)}</Typography><Typography mt={1}>{(slot.articleId&&articlesById.get(slot.articleId)?.title)||'AI chooses the next topic from your project strategy and article history'}</Typography></Box>
        </Stack>
        <Chip label={labels[slot.status]} color={slot.status==='published'?'success':slot.status==='error'?'warning':'default'} />
      </Stack>
      {slot.error&&<Alert severity="warning" sx={{mt:2}}>{slot.error}</Alert>}
      <Stack direction="row" gap={1} mt={2} flexWrap="wrap">
        {slot.articleId?<Button href={`#${base}/articles/${slot.articleId}/show`}>Open article</Button>:<Button variant="contained" disabled={busy||!configured} onClick={()=>generate(slot)}>{busy?'Please wait…':slot.status==='error'?'Retry paid generation':'Create now'}</Button>}
        {!['publishing','published'].includes(slot.status)&&<Button disabled={busy} onClick={()=>edit(slot)}>Edit date and time</Button>}
      </Stack>
    </CardContent></Card>)}</Stack>
    <Dialog open={Boolean(editing)} onClose={()=>setEditing(undefined)} fullWidth><DialogTitle>Publication date · {timeZone}</DialogTitle><DialogContent><Stack gap={3} mt={2}>
      <TextField type="datetime-local" label={`Date and time (${timeZone})`} value={localTime} onChange={e=>setLocalTime(e.target.value)} slotProps={{inputLabel:{shrink:true}}} />
      <Typography variant="body2">Changing the time preserves the draft. The saved article will be published at the selected time.</Typography>
    </Stack></DialogContent><DialogActions><Button onClick={()=>setEditing(undefined)}>Cancel</Button><Button disabled={busy} onClick={saveDate}>Save</Button></DialogActions></Dialog>
  </Box>;
}
