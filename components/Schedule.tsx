"use client";
import { useEffect, useState } from 'react';
import { Title, useGetList } from 'react-admin';
import { Alert,Box,Button,Card,CardContent,Chip,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,MenuItem,Stack,Switch,TextField,Typography } from '@mui/material';
import { useCatalog } from './ProjectCatalog';
import { useProject } from './ProjectContext';
import { browserTimeZone, localDateTime as format, scheduleDefaults, zonedInput } from '@/lib/calendar';
import type { Slot,ScheduleSettings } from '@/lib/schedule-store';
import type { Article } from '@/lib/article';
import BlogThumbnail from './BlogThumbnail';
const labels:Record<Slot['status'],string>={planned:'Scheduled',review:'Ready for review',publishing:'Publishing',published:'Published',error:'Needs attention',attention:'Needs your edit'};
const planLabels={planning:'Planning topics…',proposed:'Topic proposed',approved:'Topic approved',failed:'AI picks topic at writing'};
const cycleTitle=(key:string)=>key.length===7?`Earlier monthly calendar · ${key}`:`Cycle starting ${new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US',{dateStyle:'long'})}`;
export default function Schedule(){
  const timeZone=browserTimeZone();
  const {api,project,base}=useProject();const {reload:reloadCatalog}=useCatalog();
  const {data:articles=[],refetch:reloadArticles}=useGetList<Article>(`projects/${project.id}/articles`,{pagination:{page:1,perPage:1000},sort:{field:'updatedAt',order:'DESC'},filter:{}});
  const articlesById=new Map(articles.map(article=>[article.id,article]));
  const [config,setConfig]=useState<ScheduleSettings>({...scheduleDefaults,enabled:true});
  const [slots,setSlots]=useState<Slot[]>([]);const [configured,setConfigured]=useState<boolean>();const [workerActive,setWorkerActive]=useState(false);const [heartbeat,setHeartbeat]=useState<string>();
  const [automaticHeartbeat,setAutomaticHeartbeat]=useState<string>();const [lastTrigger,setLastTrigger]=useState<string>();
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  const [editing,setEditing]=useState<Slot>();const [localTime,setLocalTime]=useState('');
  const [topicSlot,setTopicSlot]=useState<Slot>();const [topic,setTopic]=useState('');
  const apply=(data:{configured:boolean;settings:ScheduleSettings;slots:Slot[];heartbeat?:string;automaticHeartbeat?:string;lastTrigger?:string;workerActive?:boolean})=>{setConfigured(data.configured);if(data.configured){setConfig(data.settings);setSlots(data.slots);setHeartbeat(data.heartbeat);setAutomaticHeartbeat(data.automaticHeartbeat);setLastTrigger(data.lastTrigger);setWorkerActive(Boolean(data.workerActive));}};
  const reload=async()=>{const {data}=await api('/schedule');apply(data);await reloadArticles();};
  useEffect(()=>{api('/schedule').then(({data})=>apply(data)).catch(e=>setError(e.message));},[api]);
  const run=async(work:()=>Promise<unknown>)=>{setBusy(true);setError('');setMessage('');try{await work();await reload();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const edit=(slot:Slot)=>{setEditing(slot);setLocalTime(zonedInput(slot.publishAt,timeZone));};
  const saveDate=()=>run(async()=>{await api(`/schedule/${editing!.id}`,'PUT',{revision:editing!.revision,localTime,timeZone});setEditing(undefined);});
  const editTopic=(slot:Slot)=>{setTopicSlot(slot);setTopic(slot.plan?`${slot.plan.readerQuestion} (${slot.plan.primaryKeyword})`:slot.topic);};
  const saveTopic=()=>run(async()=>{await api(`/schedule/${topicSlot!.id}`,'PUT',{revision:topicSlot!.revision,topic});setTopicSlot(undefined);setMessage('Topic saved and approved.');});
  const action=(slot:Slot,name:'approve'|'plan'|'retry',done:string)=>run(async()=>{await api(`/schedule/${slot.id}/${name}`,'POST',{});setMessage(done);});
  const generate=(slot:Slot)=>run(async()=>{const {data}=await api(`/schedule/${slot.id}/generate`,'POST',{retry:slot.status==='error'});setMessage(`Draft ready. Open the article to review it.`);window.location.hash=`${base}/articles/${data.id}/show`;});
  const number=(key:keyof ScheduleSettings)=>(e:{target:{value:string}})=>setConfig({...config,[key]:Number(e.target.value)});
  const cycles=[...new Set(slots.map(s=>s.month))].map(key=>({key,slots:slots.filter(s=>s.month===key)}));
  if(configured===undefined && !error)return <Box p={3}><Typography>Loading project calendar…</Typography></Box>;
  return <Box p={{xs:2,md:3}} maxWidth={1200}><Title title="Publication calendar" />
    <Typography variant="h4" mb={1}>Publication calendar</Typography>
    <Typography color="text.secondary" mb={3}>{project.brand} · Times shown in your local time zone ({timeZone}). Each cycle: AI proposes topics, you approve or change them, all drafts are prepared together, and each article publishes on its own date.</Typography>
    {!configured&&<Alert severity="info" sx={{mb:2}}>First connect Supabase in <a href={`#${base}/settings`}>Settings</a>.</Alert>}
    <Card><CardContent><Stack gap={2}>
      <Stack direction={{xs:'column',sm:'row'}} spacing={2} alignItems="center">
        <TextField type="number" label="Articles per cycle" value={config.perMonth} onChange={number('perMonth')} inputProps={{min:1,max:28}} />
        <FormControlLabel control={<Switch checked={config.enabled} onChange={e=>setConfig({...config,enabled:e.target.checked})} />} label="Automatic planning, writing and publication" />
      </Stack>
      <Stack direction={{xs:'column',sm:'row'}} spacing={2}>
        <TextField type="number" label="Cycle starts on day" value={config.cycleStartDay} onChange={number('cycleStartDay')} inputProps={{min:1,max:28}} helperText="1–28, every month" />
        <TextField label="Project time zone" value={config.timeZone} onChange={e=>setConfig({...config,timeZone:e.target.value})} helperText={<Button size="small" sx={{p:0}} onClick={()=>setConfig({...config,timeZone})}>Use {timeZone}</Button>} />
        <TextField type="number" label="Publication hour" value={config.publishHour} onChange={number('publishHour')} inputProps={{min:0,max:23}} helperText="In the project time zone" />
      </Stack>
      <Stack direction={{xs:'column',sm:'row'}} spacing={2}>
        <TextField type="number" label="Plan topics days before cycle" value={config.planLeadDays} onChange={number('planLeadDays')} inputProps={{min:1,max:25}} />
        <TextField type="number" label="Days to review topics" value={config.approvalDays} onChange={number('approvalDays')} inputProps={{min:0,max:10}} helperText="Then approved automatically" />
      </Stack>
      <TextField select label="If a draft is prepared late" value={config.latePolicy} onChange={e=>setConfig({...config,latePolicy:e.target.value as ScheduleSettings['latePolicy']})}>
        <MenuItem value="review24h">Allow 24 hours for review and postpone publication</MenuItem><MenuItem value="immediate">Keep the date; publish immediately if overdue</MenuItem>
      </TextField>
      <Typography variant="body2" color="text.secondary">{config.planLeadDays} days before each cycle AI proposes {config.perMonth} distinct topics. After {config.approvalDays} days (or when you approve), all drafts are prepared and wait for your edits. Articles are spread across the cycle at {String(config.publishHour).padStart(2,'0')}:00 {config.timeZone}. The latest saved version of each article publishes on its date. Manually changed dates, topics and existing drafts are preserved.</Typography>
      <Button disabled={!configured||busy} variant="contained" sx={{alignSelf:'start'}} onClick={()=>run(async()=>{await api('/schedule','PUT',config);await reloadCatalog();setMessage('Schedule saved.');})}>Save settings</Button>
    </Stack></CardContent></Card>
    <Alert severity={workerActive?'success':'warning'} sx={{my:2}}>{workerActive?'Automatic scheduling is responding.':automaticHeartbeat?'Automatic scheduling has not reported recently. Check the Railway worker and GitHub Actions.':'Automatic scheduling has not been verified. A manual run does not confirm the worker or cron trigger.'}{automaticHeartbeat&&` Last automatic check: ${format(automaticHeartbeat)} (${timeZone}).`}{heartbeat&&` Last worker check (${lastTrigger||'unknown trigger'}): ${format(heartbeat)} (${timeZone}).`} Publication may be delayed by the scheduler queue and the website build.</Alert>
    {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}{message&&<Alert severity="success" sx={{mb:2}}>{message}</Alert>}
    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}><Typography variant="h5">Current and next cycle</Typography><Button disabled={busy} onClick={()=>run(async()=>{})}>Refresh</Button></Stack>
    <Stack gap={4}>{cycles.map(cycle=>{
      const open=cycle.slots.filter(s=>!s.articleId);const first=cycle.slots[0];
      const proposed=open.filter(s=>s.planStatus==='proposed');const replannable=open.some(s=>s.planStatus!=='approved'&&s.planStatus!=='planning');
      return <Box key={cycle.key}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} gap={1} mb={1}>
          <Box><Typography variant="h6">{cycleTitle(cycle.key)}</Typography>{first.planAt&&<Typography variant="body2" color="text.secondary">Topic plan: {format(first.planAt)} · Drafts prepared: {format(first.generateAt)}{proposed[0]?.planApproveAt&&` · Auto-approval: ${format(proposed[0].planApproveAt)}`}</Typography>}</Box>
          <Stack direction="row" gap={1}>
            {proposed.length>0&&<Button variant="contained" disabled={busy} onClick={()=>action(first,'approve','Topics approved. Drafts will be prepared on schedule.')}>Approve {proposed.length} topics</Button>}
            {first.planAt&&replannable&&<Button disabled={busy||!configured} onClick={()=>action(open[0]??first,'plan','New topics proposed.')}>{proposed.length?'Propose new topics':'Plan topics now'}</Button>}
          </Stack>
        </Stack>
        <Stack gap={2}>{cycle.slots.map(slot=>{const article=slot.articleId?articlesById.get(slot.articleId):undefined;return <Card key={slot.id} variant="outlined"><CardContent>
          <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={2}>
            <Stack direction={{xs:'column',sm:'row'}} gap={2} sx={{minWidth:0}}>
              {slot.articleId&&<BlogThumbnail coverImage={article?.coverImage} coverAlt={article?.coverAlt} />}
              <Box><Typography variant="h6">{format(slot.publishAt)} · {timeZone}</Typography>
                <Typography mt={1}>{article?.title||slot.plan?.readerQuestion||slot.topic||'AI chooses the topic from your project strategy and article history'}</Typography>
                {slot.plan&&!article&&<Stack direction="row" gap={1} mt={1} flexWrap="wrap"><Chip size="small" label={`Search phrase: ${slot.plan.primaryKeyword}`} /><Chip size="small" label={slot.plan.searchIntent} /></Stack>}
                {slot.plan&&!article&&<Typography variant="body2" color="text.secondary" mt={1}>{slot.plan.angle}</Typography>}
              </Box>
            </Stack>
            <Stack gap={1} alignItems={{sm:'flex-end'}}>
              <Chip label={labels[slot.status]} color={slot.status==='published'?'success':['error','attention'].includes(slot.status)?'warning':'default'} />
              {!slot.articleId&&slot.planStatus&&<Chip size="small" variant="outlined" label={planLabels[slot.planStatus]} />}
            </Stack>
          </Stack>
          {slot.error&&<Alert severity="warning" sx={{mt:2}}>{slot.error}</Alert>}
          <Stack direction="row" gap={1} mt={2} flexWrap="wrap">
            {slot.articleId?<Button href={`#${base}/articles/${slot.articleId}/show`}>Open article</Button>:<Button variant="contained" disabled={busy||!configured||slot.planStatus==='planning'} onClick={()=>generate(slot)}>{busy?'Please wait…':slot.status==='error'?'Retry paid generation':'Create now'}</Button>}
            {!slot.articleId&&slot.planStatus!=='planning'&&<Button disabled={busy} onClick={()=>editTopic(slot)}>Edit topic</Button>}
            {!['publishing','published'].includes(slot.status)&&<Button disabled={busy} onClick={()=>edit(slot)}>Edit date and time</Button>}
            {slot.articleId&&['error','attention'].includes(slot.status)&&<Button disabled={busy} onClick={()=>action(slot,'retry','The scheduler will try again on its next pass.')}>Try again</Button>}
          </Stack>
        </CardContent></Card>;})}</Stack>
      </Box>;})}</Stack>
    <Dialog open={Boolean(editing)} onClose={()=>setEditing(undefined)} fullWidth><DialogTitle>Publication date · {timeZone}</DialogTitle><DialogContent><Stack gap={3} mt={2}>
      <TextField type="datetime-local" label={`Date and time (${timeZone})`} value={localTime} onChange={e=>setLocalTime(e.target.value)} slotProps={{inputLabel:{shrink:true}}} />
      <Typography variant="body2">Changing the time preserves the draft. The saved article will be published at the selected time.</Typography>
    </Stack></DialogContent><DialogActions><Button onClick={()=>setEditing(undefined)}>Cancel</Button><Button disabled={busy} onClick={saveDate}>Save</Button></DialogActions></Dialog>
    <Dialog open={Boolean(topicSlot)} onClose={()=>setTopicSlot(undefined)} fullWidth><DialogTitle>Article topic</DialogTitle><DialogContent><Stack gap={2} mt={2}>
      <TextField multiline minRows={3} label="Reader question, search phrase or brief" value={topic} onChange={e=>setTopic(e.target.value)} />
      <Typography variant="body2">Your topic replaces the AI proposal and is approved for writing.</Typography>
    </Stack></DialogContent><DialogActions><Button onClick={()=>setTopicSlot(undefined)}>Cancel</Button><Button disabled={busy||topic.trim().length<5} onClick={saveTopic}>Save topic</Button></DialogActions></Dialog>
  </Box>;
}
