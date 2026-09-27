"use client";
import { createContext,useCallback,useContext,useEffect,useState,type ReactNode } from 'react';
import { api } from './dataProvider';
import type { ProjectSummary } from '@/lib/projects';
import { Alert,Box,Button,Typography } from '@mui/material';
const Context=createContext<{projects:ProjectSummary[];reload:()=>Promise<void>}|null>(null);
export function useCatalog(){const value=useContext(Context);if(!value)throw new Error('Project catalog unavailable');return value;}
export function ProjectCatalog({children}:{children:ReactNode}){
 const [projects,setProjects]=useState<ProjectSummary[]>([]);const [loaded,setLoaded]=useState(false);const [error,setError]=useState('');
 const reload=useCallback(async()=>{try{const result=await api('/api/projects?archived=true');setProjects(result.data);setLoaded(true);setError('');}catch(e){setError((e as Error).message);throw e;}},[]);
 useEffect(()=>{let active=true;api('/api/projects?archived=true').then(result=>{if(active){setProjects(result.data);setLoaded(true);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 if(!loaded)return <Box p={4}>{error?<><Alert severity="error">{error}</Alert><Button onClick={()=>reload().catch(()=>{})}>Try again</Button></>:<Typography>Loading projects…</Typography>}</Box>;
 return <Context.Provider value={{projects,reload}}>{children}</Context.Provider>;
}
