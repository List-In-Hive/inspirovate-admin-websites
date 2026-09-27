"use client";
import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { mediaId } from '@/lib/media-path';
import { useProject } from './ProjectContext';

export default function BlogThumbnail({ coverImage, coverAlt, compact = false }: { coverImage?: string; coverAlt?: string; compact?: boolean }) {
  const { project, base } = useProject();
  const id = coverImage ? mediaId(coverImage) : undefined;
  const websiteImage = coverImage?.startsWith('/images/') ? `${project.url.replace(/\/$/, '')}${coverImage}` : undefined;
  const sources = [...new Set([id ? `/api${base}/media/${id}` : undefined, websiteImage].filter((src): src is string => Boolean(src)))];
  return <ThumbnailImage key={sources.join('|')} sources={sources} alt={coverAlt || 'Article cover'} compact={compact} />;
}

function ThumbnailImage({ sources, alt, compact }: { sources: string[]; alt: string; compact: boolean }) {
  const [index, setIndex] = useState(0);
  return <Box sx={{ width: compact ? 80 : 120, height: compact ? 60 : 90, flexShrink: 0, borderRadius: 1.5, overflow: 'hidden', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    {sources[index]
      // Project photos can be private API responses or files on the project's website.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={sources[index]} alt={alt} width={compact ? 80 : 120} height={compact ? 60 : 90} loading="lazy" decoding="async" onError={() => setIndex(index + 1)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      : <Typography variant="caption" color="text.secondary">No photo</Typography>}
  </Box>;
}
