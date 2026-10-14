"use client";
import { useEffect, useState } from 'react';
import { Title } from 'react-admin';
import { Alert, Box, Button, Card, CardContent, Chip, MenuItem, Tab, Tabs, Stack, TextField, Typography } from '@mui/material';
import { useSearchParams } from 'react-router';
import Knowledge from './Knowledge';
import Library from './Library';
import { useProject } from './ProjectContext';
import { blogSettingsSchema, type BlogSettings as Settings } from '@/lib/blog-settings';
import { imageAspects } from '@/lib/article-format';

const counts = [
  {key:'photoCount', label:'Photos per article', min:1, max:6, hint:'Total unique photos, including the cover. The cover is also used inside the article.'},
  {key:'externalLinkCount', label:'External links', min:0, max:10, hint:'Links to relevant sources on other websites.'},
  {key:'internalLinkCount', label:'Internal links', min:0, max:10, hint:'Links to pages and articles on this project’s website.'},
] as const;
const writing = [
  {key:'audience', label:'Audience', rows:2, max:1500},
  {key:'tone', label:'Writing style', rows:2, max:1000},
  {key:'goals', label:'Blog goals', rows:3, max:3000},
  {key:'contentAreas', label:'Content areas', rows:4, max:5000},
  {key:'editorialRules', label:'Editorial rules and topics to avoid', rows:5, max:3000},
] as const;
export default function BlogSettings() {
  const {project} = useProject();
  const [params,setParams] = useSearchParams();
  const section = ['knowledge','library'].includes(params.get('section')||'') ? params.get('section')! : 'rules';
  return <Box>
    <Box px={{xs:2,md:3}} pt={3}>
      <Title title={`${project.name} · Blog rules & settings`}/>
      <Typography variant="h4" mb={1}>Blog rules & settings</Typography>
      <Typography color="text.secondary">Business information, writing preferences and source material for {project.brand}.</Typography>
      <Tabs value={section} onChange={(_,value)=>setParams(value==='rules'?{}:{section:value})} variant="scrollable" scrollButtons="auto" sx={{mt:2,borderBottom:1,borderColor:'divider'}}>
        <Tab value="rules" label="Rules & format"/><Tab value="knowledge" label="Knowledge"/><Tab value="library" label="Blog library"/>
      </Tabs>
    </Box>
    <Box sx={{display:section==='rules'?'block':'none'}}><RulesEditor/></Box>
    {section==='knowledge'&&<Knowledge/>}{section==='library'&&<Library/>}
  </Box>;
}
function RulesEditor() {
  const {api,project,base} = useProject();
  const [settings,setSettings] = useState<Settings>();
  const [saved,setSaved] = useState<Settings>();
  const [active,setActive] = useState<Settings>();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  useEffect(()=>{
    let current=true;
    api('/blog-settings').then(({data,active})=>{if(current){setSettings(data);setSaved(data);setActive(active);}}).catch(e=>{if(current)setError(e.message);});
    return ()=>{current=false;};
  },[api]);
  const dirty=JSON.stringify(settings)!==JSON.stringify(saved);
  const change=(patch:Partial<Settings>)=>{setSettings(s=>s?{...s,...patch}:s);setMessage('');};
  const applyWriting=async()=>{
    if(!settings)return;
    const parsed=blogSettingsSchema.safeParse(settings);
    if(!parsed.success){setError(parsed.error.issues.map(i=>i.message).join(' '));return;}
    setBusy(true);setError('');setMessage('');
    try{
      const {data}=await api('/blog-settings?apply=true','PUT',parsed.data);
      setSettings(data);setSaved(data);
      setActive(data);
      setMessage('All rules are active for new articles, including photo and link counts. Existing drafts keep their saved rules.');
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const detectStyle=async()=>{
    setBusy(true);setError('');setMessage('');
    try{
      const {data,samples}=await api('/blog-settings/visual-style','POST',{});
      change(data);setMessage(`Style detected from ${samples.length} website image${samples.length===1?'':'s'}. Review it, then save or apply the rules.`);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const save=async()=>{
    if(!settings)return;
    setError('');setMessage('');
    const checked=blogSettingsSchema.safeParse(settings);
    if(!checked.success){setError(checked.error.issues.map(i=>i.message).join(' '));return;}
    setBusy(true);
    try{const {data}=await api('/blog-settings','PUT',checked.data);setSettings(data);setSaved(data);setMessage('Draft settings saved for this project.');}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <Box p={{xs:2,md:3}} maxWidth={1100}>
    <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap" mb={1}>
      <Typography variant="h5">Rules & format</Typography><Chip label="Project rules" variant="outlined"/>
    </Stack>
    <Typography color="text.secondary" mb={3}>Set the article format and writing preferences for {project.brand}.</Typography>
    <Alert severity="info" sx={{mb:3}}>Use “Apply all rules” to activate business information, writing rules, image style and photo/link counts for new articles. “Save draft settings” only saves edits for later. Existing articles keep their original rules. External sources are researched during generation; incomplete articles are held for review.</Alert>
    {active&&<Typography variant="body2" sx={{mb:2}}>Active for new articles: {active.photoCount} photos · {active.externalLinkCount} external links · {active.internalLinkCount} internal links{JSON.stringify(settings)!==JSON.stringify(active)?". The form contains unapplied changes.":"."}</Typography>}
    {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
    {message&&<Alert severity="success" sx={{mb:2}}>{message}</Alert>}
    {!settings?<Typography role="status">{error?'Settings could not be loaded. Refresh to try again.':'Loading blog settings…'}</Typography>:<Stack gap={3}>
      <Card><CardContent sx={{p:{xs:2,md:3}}}>
        <Typography variant="h6" mb={1}>Business information</Typography>
        <Typography color="text.secondary" mb={3}>Verified facts AI can use when writing about this business.</Typography>
        <Stack gap={3}>
          <TextField label="Business name" value={settings.name} fullWidth disabled={busy} onChange={e=>change({name:e.target.value})} slotProps={{htmlInput:{maxLength:150}}}/>
          <TextField label="Business facts and constraints" value={settings.facts} fullWidth multiline minRows={5} disabled={busy} onChange={e=>change({facts:e.target.value})} slotProps={{htmlInput:{maxLength:6000}}}/>
        </Stack>
      </CardContent></Card>
      <Card><CardContent sx={{p:{xs:2,md:3}}}>
        <Typography variant="h6" mb={1}>Article format</Typography>
        <Typography color="text.secondary" mb={3}>Choose the preferred number of photos and links in each new article.</Typography>
        <Stack direction={{xs:'column',md:'row'}} gap={3}>
          {counts.map(f=><TextField key={f.key} select fullWidth label={f.label} value={settings[f.key]} disabled={busy} onChange={e=>change({[f.key]:Number(e.target.value)})} helperText={f.hint}>
            {Array.from({length:f.max-f.min+1},(_,i)=>i+f.min).map(n=><MenuItem key={n} value={n}>{n}</MenuItem>)}
          </TextField>)}
        </Stack>
        <Typography variant="body2" color="text.secondary" mt={2}>Defaults: 2 photos, 3 external links and 3 internal links. Counts are checked before publication. If relevant verified links are unavailable, the draft needs attention.</Typography>
      </CardContent></Card>
      <Card><CardContent sx={{p:{xs:2,md:3}}}>
        <Typography variant="h6" mb={1}>Image style</Typography>
        <Typography color="text.secondary" mb={3}>How every new cover and article photo should look, so images match this website’s design. Leave the style empty for realistic editorial photos.</Typography>
        <Stack gap={3}>
          <TextField label="Style for all images" value={settings.imageStyle} fullWidth multiline minRows={4} disabled={busy} onChange={e=>change({imageStyle:e.target.value})} placeholder="Flat vector illustration, navy #111B2B, cream #F3EEE6 and one red #C8392B accent, no gradients, soft long shadow" helperText="Medium, colours, background and level of detail. Subjects still change with each article." slotProps={{htmlInput:{maxLength:1500}}}/>
          <TextField select label="Image proportions" value={settings.imageAspect} disabled={busy} onChange={e=>change({imageAspect:e.target.value as Settings['imageAspect']})} helperText="Match the shape the website uses for blog covers so they are not cut unexpectedly." sx={{maxWidth:360}}>
            {imageAspects.map(a=><MenuItem key={a} value={a}>{a}</MenuItem>)}
          </TextField>
          <Box><Button variant="outlined" disabled={busy} onClick={detectStyle}>{busy?'Working…':'Detect from website images (paid)'}</Button></Box>
          <Typography variant="body2" color="text.secondary">Detection looks at up to four blog images in the repository and fills both fields. It is one small paid AI request; nothing changes until you save or apply.</Typography>
        </Stack>
      </CardContent></Card>
      <Card><CardContent sx={{p:{xs:2,md:3}}}>
        <Typography variant="h6" mb={1}>Writing rules</Typography>
        <Typography color="text.secondary" mb={3}>Start from your current project strategy and refine it here for review.</Typography>
        <Stack gap={3}>{writing.map(f=><TextField key={f.key} fullWidth multiline minRows={f.rows} label={f.label} value={settings[f.key]} disabled={busy} onChange={e=>change({[f.key]:e.target.value})} slotProps={{htmlInput:{maxLength:f.max}}}/>)}</Stack>
      </CardContent></Card>
      <Stack direction="row" alignItems="center" flexWrap="wrap" gap={2}>
        <Button variant="contained" onClick={save} disabled={busy}>{busy?'Saving…':'Save draft settings'}</Button>
        <Button variant="outlined" disabled={busy} onClick={applyWriting}>Apply all rules</Button>
        <Button disabled={busy||!dirty} onClick={()=>{setSettings(saved);setMessage('');setError('');}}>Discard changes</Button>
        {dirty&&<Typography variant="body2" color="text.secondary">Unsaved changes</Typography>}
      </Stack>
      <Typography variant="body2" color="text.secondary">Manage additional sources in <a href={`#${base}/blog-settings?section=knowledge`}>Knowledge</a> and publication dates in <a href={`#${base}/calendar`}>Calendar</a>.</Typography>
    </Stack>}
  </Box>;
}
