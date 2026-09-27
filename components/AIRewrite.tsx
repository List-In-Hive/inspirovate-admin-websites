"use client";
import { useState } from 'react';
import { Alert,Button,Card,CardContent,Stack,TextField,Typography } from '@mui/material';
import { useRefresh } from 'react-admin';
import { useProject } from './ProjectContext';
import type { Article } from '@/lib/article';
export default function AIRewrite({article}:{article:Article}){
  const {api}=useProject();
  const refresh=useRefresh();const [prompt,setPrompt]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  const [request,setRequest]=useState<{id:string;revision:number;prompt:string}>();
  if(article.commit||article.status==='deploying')return null;
  const run=async()=>{
    const body=request||{id:crypto.randomUUID(),revision:article.revision,prompt};setRequest(body);setBusy(true);setError('');setMessage('');
    try{await api(`/articles/${article.id}/rewrite`,'POST',body);setMessage('Changes saved. Review the updated version below.');setRequest(undefined);setPrompt('');refresh();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <Card variant="outlined" sx={{mb:3}}><CardContent><Typography variant="h6" mb={2}>Revise this article with AI</Typography><Stack gap={2}>
    <TextField label="What would you like to change?" multiline minRows={2} value={prompt} onChange={e=>setPrompt(e.target.value)} disabled={busy||Boolean(request)} helperText="For example: shorten the introduction and add five practical tips. Edits do not change the scheduled publication time." />
    <Stack direction="row" gap={2}><Button variant="outlined" disabled={busy||prompt.trim().length<3} onClick={run}>{busy?'Revising…':request?'Retry saving this request':'Apply AI revision'}</Button>{request&&<Button disabled={busy} onClick={()=>setRequest(undefined)}>New paid request</Button>}</Stack>
    {error&&<Alert severity="error">{error}</Alert>}{message&&<Alert severity="success">{message}</Alert>}
  </Stack></CardContent></Card>;
}
