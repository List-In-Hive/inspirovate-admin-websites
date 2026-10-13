"use client";

import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, Tab, Tabs, Typography } from '@mui/material';
import { Title } from 'react-admin';
import { useSearchParams } from 'react-router';
import Markdown from 'react-markdown';

const documents = [
  { id: 'setup', label: 'Setup checklist', file: 'project-setup.md' },
  { id: 'prompt', label: 'Website prompt', file: 'website-prompt.md' },
  { id: 'contract', label: 'Developer requirements', file: 'publication-contract.md' },
];

export default function SetupGuide() {
  const [params, setParams] = useSearchParams();
  const selected = documents.find(doc => doc.id === params.get('section')) || documents[0];
  const [loaded, setLoaded] = useState<{ file: string; text: string }>();
  const [failure, setFailure] = useState<{ file: string; attempt: number; message: string }>();
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const error = failure?.file === selected.file && failure.attempt === attempt ? failure.message : '';
  const text = loaded?.file === selected.file ? loaded.text : undefined;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/docs/${selected.file}`, { signal: controller.signal, cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('The guide could not be loaded. Please retry.'); return response.text(); })
      .then(content => { if (!controller.signal.aborted) setLoaded({ file: selected.file, text: content }); })
      .catch(e => { if (!controller.signal.aborted) setFailure({ file: selected.file, attempt, message: e.message }); });
    return () => controller.abort();
  }, [selected.file, attempt]);

  const copy = async () => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setNotice('Copied. Replace the bracketed business details before using the prompt.'); }
    catch { setNotice('Clipboard access is unavailable. Download the Markdown file and copy its text.'); }
  };

  return <Box p={{ xs: 2, md: 3 }} maxWidth={1120}>
    <Title title="Documentation" />
    <Typography variant="h4" mb={1}>Documentation</Typography>
    <Typography color="text.secondary" mb={2}>Shared setup instructions and a reusable website prompt for all projects.</Typography>
    <Stack direction="row" gap={1} flexWrap="wrap" mb={2}>
      <Button href="#/projects">All projects</Button>
    </Stack>
    <Tabs value={selected.id} onChange={(_, value: string) => { setNotice(''); setParams({ section: value }); }} variant="scrollable" scrollButtons="auto" aria-label="Setup documentation" sx={{ mb: 2 }}>
      {documents.map(doc => <Tab key={doc.id} label={doc.label} value={doc.id} />)}
    </Tabs>
    <Stack direction="row" gap={1} flexWrap="wrap" mb={2}>
      {selected.id === 'prompt' && <Button variant="contained" onClick={copy} disabled={!text}>Copy website prompt</Button>}
      <Button component="a" href={`/docs/${selected.file}`} download={selected.file}>Download Markdown</Button>
    </Stack>
    {notice && selected.id === 'prompt' && <Alert severity="info" sx={{ mb: 2 }}>{notice}</Alert>}
    {error ? <Alert severity="error" action={<Button color="inherit" onClick={() => setAttempt(n => n + 1)}>Retry</Button>}>{error}</Alert>
      : text === undefined ? <Box role="status" aria-label="Loading guide"><CircularProgress size={24} /></Box>
      : <Card variant="outlined"><CardContent sx={{ p: { xs: 2, md: 4 }, overflowWrap: 'anywhere', '& h1': { fontSize: '1.7rem' }, '& h2': { mt: 4, fontSize: '1.3rem' }, '& h3': { mt: 3 }, '& p, & li': { lineHeight: 1.75 }, '& li + li': { mt: 1 }, '& pre': { p: 2, bgcolor: '#f5f6f3', borderRadius: 1, overflowX: 'auto', fontSize: '0.85rem' }, '& code': { fontSize: '0.9em' }, '& a': { color: 'primary.main' } }}>
        <Markdown skipHtml components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>{text}</Markdown>
      </CardContent></Card>}
  </Box>;
}
