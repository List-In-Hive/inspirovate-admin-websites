"use client";
import { useState, type FormEvent } from 'react';
export default function Login() {
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError('');
    try {
      const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.message||'Sign-in failed.');
      setPassword('');window.location.replace('/');
    }catch(e){setError((e as Error).message);setBusy(false);}
  }
  return <main style={{maxWidth:420,margin:'12vh auto',padding:24,fontFamily:'system-ui'}}><h1>Inspirovate</h1><p>Sign in to manage your projects.</p><form onSubmit={submit}><label htmlFor="password">Admin password</label><input id="password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} style={{display:'block',width:'100%',padding:12,margin:'10px 0 20px',fontSize:16,border:'1px solid #b5c1ba',borderRadius:8}}/><button disabled={busy} style={{width:'100%',padding:12,background:'#2e5546',color:'white',border:0,borderRadius:8,fontSize:16,cursor:'pointer'}}>{busy?'Signing in…':'Sign in'}</button>{error&&<p role="alert" style={{color:'#a12222'}}>{error}</p>}</form></main>;
}
