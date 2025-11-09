// PaginationControls.tsx — previous/next controls, page indicator and direct jump-to-page input
import { useEffect, useState } from "react";
import { Box, Button, Typography, TextField, IconButton } from "@mui/material";
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

// Simplified pagination to match screenshot: Prev icon, first few page buttons (1..5), ellipsis, small numeric spinner input, last page button, Next icon
export default function PaginationControls({ page, total, perPage, onPage }: { page: number; total: number; perPage: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const [pageInput, setPageInput] = useState(String(page));

  useEffect(() => setPageInput(String(page)), [page]);

  const siblings = 1; // number of page buttons to show on each side of current

  const jumpTo = (raw?: string) => {
    const v = typeof raw === 'string' ? raw : pageInput;
    const n = parseInt(String(v || ''), 10);
    if (!isNaN(n)) {
      const clamped = Math.max(1, Math.min(totalPages, n));
      if (clamped !== page) onPage(clamped);
      else setPageInput(String(clamped));
    } else {
      setPageInput(String(page));
    }
  };

  const renderPageButton = (p: number) => (
    <Button
      key={p}
      variant={p === page ? 'contained' : 'outlined'}
      color={p === page ? 'primary' : 'inherit'}
      size="small"
      onClick={() => onPage(p)}
      sx={{ minWidth: 32, px: 1 }}
    >
      {p}
    </Button>
  );

  // Decide pages to show: first page, left ellipsis (if needed), a window around current page, right ellipsis (if needed), last page
  const pages: Array<number | 'ellipsis'> = [];

  if (totalPages <= 7) {
    // show all
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);

    const left = Math.max(2, page - siblings);
    const right = Math.min(totalPages - 1, page + siblings);

    if (left > 2) pages.push('ellipsis');

    for (let p = left; p <= right; p++) pages.push(p);

    if (right < totalPages - 1) pages.push('ellipsis');

    pages.push(totalPages);
  }

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
      <IconButton onClick={() => onPage(Math.max(1, page - 1))} size="small" disabled={page <= 1} sx={{ bgcolor: '#111' }}>
        <ChevronLeftIcon sx={{ color: 'white' }} />
      </IconButton>

      {pages.map((p, idx) =>
        p === 'ellipsis' ? (
          <Typography key={`e${idx}`} variant="caption" sx={{ color: '#cbd5e1' }}>…</Typography>
        ) : (
          renderPageButton(p)
        )
      )}

      {/* small numeric input matching screenshot (no Go button). Enter or blur triggers jump. */}
      <TextField
        size="small"
        value={pageInput}
        onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={(e) => { if (e.key === 'Enter') jumpTo(); }}
        onBlur={() => jumpTo()}
        inputProps={{ min: 1, max: totalPages, style: { textAlign: 'center', width: 54 } }}
        sx={{ width: 64, '& .MuiInputBase-input': { py: 0.5 } }}
      />

      <IconButton onClick={() => onPage(Math.min(totalPages, page + 1))} size="small" disabled={page >= totalPages} sx={{ bgcolor: '#111' }}>
        <ChevronRightIcon sx={{ color: 'white' }} />
      </IconButton>
    </Box>
  );
}
