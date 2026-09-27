"use client";
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Alert, Box, Button, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useLocation } from 'react-router';
import { api } from './dataProvider';
import { projectPath, type Project } from '@/lib/projects';
const Context=createContext<{project:Project;base:string;api:typeof api}|null>(null);
export function useProject() { const value=useContext(Context);if(!value)throw new Error('Select a project first.');return value; }
const sections=[['','Overview'],['articles','Articles'],['calendar','Calendar'],['generate','Create with AI'],['knowledge','Knowledge'],['library','Blog library'],['settings','Settings']];
export function ProjectFrame({project,children}:{project:Project;children:ReactNode}) {
  const location=useLocation();
  const base=projectPath(project.id);
  const value=useMemo(()=>({project,base,api:(url:string,method?:string,body?:unknown)=>api(`/api${base}${url}`,method,body)}),[project,base]);
  const selected=sections.find(([segment])=>segment && location.pathname.startsWith(`${base}/${segment}`))?.[0]||'';
  return <Context.Provider value={value}><Box sx={{p:{xs:1,md:3},pb:0}}>
    <Button href="#/projects" size="small">← All projects</Button>
    <Stack direction="row" justifyContent="space-between" alignItems="center" mt={1} gap={2}>
      <Box><Typography variant="h4" fontWeight={650}>{project.name}</Typography><Typography color="text.secondary">{project.brand}</Typography></Box>
      {project.url&&<Button href={project.url} target="_blank" rel="noreferrer">Open website ↗</Button>}
    </Stack>
    <Tabs value={selected} variant="scrollable" scrollButtons="auto" sx={{mt:2,borderBottom:1,borderColor:'divider'}}>
      {sections.map(([segment,label])=><Tab key={segment} value={segment} label={label} href={`#${base}${segment?`/${segment}`:''}`} />)}
    </Tabs>
  </Box>{project.localOnly&&<Alert severity="info" sx={{mx:3,mt:2}}>Local test project. Automatic blogging and GitHub publication are disabled. You can test drafts, settings, removal and restoration.</Alert>}{children}</Context.Provider>;
}
