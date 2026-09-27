"use client";
import { useEffect,useState } from 'react';
import { Alert,Box,Button,Card,CardContent,Dialog,DialogTitle,DialogContent,Stack,Typography } from '@mui/material';
import { Title } from 'react-admin';
import Markdown from 'react-markdown';
import { useProject } from './ProjectContext';
import type { LibraryArticle } from '@/lib/content-store';
import BlogThumbnail from './BlogThumbnail';
export default function Library(){
 const {api,project}=useProject();const [items,setItems]=useState<LibraryArticle[]>([]);const [selected,setSelected]=useState<LibraryArticle>();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{api('/library').then(r=>setItems(r.data)).catch(e=>setError(e.message));},[api]);
 const sync=async()=>{setBusy(true);setError('');try{setItems((await api('/library','POST',{})).data);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <Box p={{xs:2,md:3}}><Title title={`${project.name} · Blog library`} /><Typography variant="h4" mb={1}>Blog library</Typography><Typography color="text.secondary" mb={2}>Full published articles from this project. AI uses related texts and recent topics to avoid repetition. Drafts in Articles are also included in its context.</Typography><Button variant="contained" disabled={busy} onClick={sync}>{busy?'Importing…':'Import from website repository'}</Button><Typography variant="body2" color="text.secondary" my={2}>Reads the configured repository checkout. On the server it is refreshed by the scheduled workflow. Existing articles are not changed.</Typography>{error&&<Alert severity="error">{error}</Alert>}
 <Stack gap={2}>{items.map(item=><Card key={item.slug}><CardContent><Stack direction={{xs:'column',sm:'row'}} gap={2}><BlogThumbnail coverImage={item.coverImage} coverAlt={item.coverAlt} /><Box sx={{minWidth:0}}><Typography variant="h6">{item.title}</Typography><Typography color="text.secondary" my={1}>{new Date(item.publishedAt).toLocaleDateString('en-US')} · {item.body.split(/\s+/).length} words</Typography><Typography>{item.description}</Typography><Button onClick={()=>setSelected(item)}>Read full article</Button><Button href={item.source} target="_blank" rel="noreferrer">Open website ↗</Button></Box></Stack></CardContent></Card>)}</Stack>
 {!items.length&&<Typography mt={3}>No articles imported yet.</Typography>}<Dialog open={Boolean(selected)} onClose={()=>setSelected(undefined)} maxWidth="md" fullWidth><DialogTitle>{selected?.title}</DialogTitle><DialogContent><Markdown skipHtml components={{a:({children})=><span>{children}</span>,img:()=>null}}>{selected?.body||''}</Markdown></DialogContent></Dialog></Box>;
}
