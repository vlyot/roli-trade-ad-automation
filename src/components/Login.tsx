// Login.tsx
// Responsibility: Handle username search and user selection.

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Box,
  TextField,
  Typography,
  CircularProgress,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Alert,
  Container,
  Avatar,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

interface RobloxUser {
  id: number;
  name: string;
  display_name: string;
  has_verified_badge: boolean;
  // previous_usernames is no longer needed
  // optional thumbnail URL fetched from Rolimons thumbnails endpoint
  thumbnail?: string;
}

interface RolimonsPlayer {
  id: number;
  name: string;
  thumbnail?: string;
}

interface PlayersResponse {
  success: boolean;
  result_count: number;
  players: RolimonsPlayer[];
  ids?: string[];
}

interface LoginProps {
  onUserSelected: (user: RobloxUser) => void;
}

const Login: React.FC<LoginProps> = ({ onUserSelected }) => {
  const [keyword, setKeyword] = useState('');
  const [users, setUsers] = useState<RobloxUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  useEffect(() => {
    // Debounced search: wait 400ms after user stops typing
    if (keyword.length < 3) {
      // Clear results for short queries
      setUsers([]);
      setError(keyword.length === 0 ? null : 'Enter at least 3 characters to search');
      return;
    }

    setIsSearching(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        setDebugLogs((d) => [...d, `Searching for '${keyword}'`]);

        const resp = await invoke<PlayersResponse>('search_players_with_thumbnails', {
          searchstring: keyword,
          limit: 10,
        });

        const players = resp?.players ?? [];
        //setDebugLogs((d) => [...d, `Search returned ${players.length} results (Rolimons)`]);

        // Map Rolimons players to our RobloxUser shape (no thumbnail yet)
        const mapped: RobloxUser[] = players.map((p) => ({
          id: p.id,
          name: p.name,
          display_name: p.name,
          has_verified_badge: false,
        }));

        // Show usernames immediately
        setUsers(mapped);

        // If there are ids returned, fetch thumbnails afterwards (batch then fallback to singles)
        const ids = resp?.ids ?? players.map((p) => p.id.toString());
        if (ids.length > 0) {
          fetchThumbnails(ids);
        }

        if (mapped.length === 0) {
          setError('No users found. Try a different search term.');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setDebugLogs((d) => [...d, `Search error: ${msg}`]);
        setUsers([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [keyword]);

  // Fetch thumbnails: try batch, then fallback to single fetches for missing ids
  const fetchThumbnails = async (ids: string[]) => {
    try {
      //setDebugLogs((d) => [...d, `Fetching thumbnails for ${ids.length} ids (batch)`]);
      // Convert to numbers for backend command
      const numericIds = ids.map((s) => Number(s));
      // pass both camelCase and snake_case keys to satisfy Tauri's arg mapping
      const batchMap = await invoke<Record<string, string>>('fetch_avatar_thumbnails', {
        userIds: numericIds,
        user_ids: numericIds,
      });

      // Merge into users
      setUsers((prev) =>
        prev.map((u) => ({ ...u, thumbnail: batchMap[u.id.toString()] ?? u.thumbnail }))
      );
      // Check for missing ids
      const missing = ids.filter((id) => !(id in batchMap));
      if (missing.length > 0) {
        //setDebugLogs((d) => [...d, `Batch missing ${missing.length} thumbnails, fetching individually`]);
        // Fetch individually in parallel but limit concurrency
        const promises = missing.map((mid) =>
          invoke<Record<string, string>>('fetch_avatar_thumbnails', { userIds: [Number(mid)], user_ids: [Number(mid)] }).then(
            (m) => ({ id: mid, map: m })
          )
        );
        const results = await Promise.allSettled(promises);
        for (const r of results) {
          if (r.status === 'fulfilled') {
            const { id, map } = r.value as { id: string; map: Record<string, string> };
            const url = map[id];
            if (url) {
              setUsers((prev) => prev.map((u) => (u.id.toString() === id ? { ...u, thumbnail: url } : u)));
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDebugLogs((d) => [...d, `Thumbnail fetch error: ${msg}`]);
      // Fallback: try individual fetches for first 10 ids
      const limited = ids.slice(0, 10);
      const promises = limited.map((mid) =>
        invoke<Record<string, string>>('fetch_avatar_thumbnails', { userIds: [Number(mid)], user_ids: [Number(mid)] }).then((m) => ({ id: mid, map: m }))
      );
      const results = await Promise.allSettled(promises);
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const { id, map } = r.value as { id: string; map: Record<string, string> };
          const url = map[id];
          if (url) {
            setUsers((prev) => prev.map((u) => (u.id.toString() === id ? { ...u, thumbnail: url } : u)));
          }
        }
      }
    }
  };

  // Thumbnail fetching moved to backend (Tauri command) — frontend calls `fetch_avatar_thumbnails` via `invoke`.

  const handleUserSelect = (user: RobloxUser) => {
    onUserSelected(user);
  };

  const [showHowTo, setShowHowTo] = useState(false);
  const [howToContent, setHowToContent] = useState<string>('');

  // Minimal markdown -> HTML converter (same-lightweight as used in App)
  const markdownToHtml = (md: string) => {
    if (!md) return '';
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = md.split(/\r?\n/);
    let out = '';
    let inList = false;
    let inCode = false;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (line.trim().startsWith('```')) {
        inCode = !inCode;
        out += inCode ? '<pre><code>' : '</code></pre>';
        continue;
      }
      if (inCode) {
        out += esc(line) + '\n';
        continue;
      }
      const h = line.match(/^\s*(#{1,6})\s+(.*)$/);
      if (h) {
        const level = h[1].length;
        if (inList) { out += '</ul>'; inList = false; }
        out += `<h${level}>${esc(h[2])}</h${level}>`;
        continue;
      }
      const img = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (img) {
        if (inList) { out += '</ul>'; inList = false; }
        out += `<p><img src="${esc(img[2])}" alt="${esc(img[1])}" style="max-width:100%"/></p>`;
        continue;
      }
      const ul = line.match(/^\s*[-*]\s+(.*)$/);
      if (ul) {
        if (!inList) { out += '<ul>'; inList = true; }
        out += `<li>${esc(ul[1])}</li>`;
        continue;
      }
      if (/^\s*-{3,}\s*$/.test(line)) {
        if (inList) { out += '</ul>'; inList = false; }
        out += '<hr/>';
        continue;
      }
      if (line.trim() === '') {
        if (inList) { out += '</ul>'; inList = false; }
        continue;
      }
      let text = esc(line).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
      out += `<p>${text}</p>`;
    }
    if (inList) out += '</ul>';
    return out;
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          py: 4,
        }}
      >
        <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
          <Typography variant="h4" gutterBottom align="center" sx={{ mb: 3 }}>
            Verify your Roblox account to use Roli Trade Automation
          </Typography>

          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <Button variant="outlined" size="small" onClick={async () => {
              setShowHowTo(true);
              try {
                const resp = await fetch('/how-to-use.md');
                if (resp.ok) setHowToContent(await resp.text());
                else setHowToContent('Could not load guide.');
              } catch (e) {
                setHowToContent('Could not load guide.');
              }
            }}>How to use</Button>
          </Box>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Enter your Roblox username to get started
          </Typography>

          <TextField
            fullWidth
            label="Roblox Username"
            placeholder="Search for your username..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} />,
            }}
            helperText="Enter at least 3 characters to search"
            sx={{ mb: 2 }}
          />

          {isSearching && (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
              <CircularProgress />
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {users.length > 0 && !isSearching && (
            <Paper variant="outlined" sx={{ maxHeight: 400, overflow: 'auto' }}>
              <List>
                {users.map((user) => (
                  <ListItem key={user.id} disablePadding>
                    <ListItemButton onClick={() => handleUserSelect(user)}>
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Avatar src={user.thumbnail} alt={user.display_name} sx={{ width: 36, height: 36 }} />
                                  <Box>
                                    {/* use non-<p> root to avoid nesting issues inside ListItemText */}
                                    <Typography variant="subtitle1" component="div">
                                      {user.display_name}
                                    </Typography>
                                    {user.has_verified_badge && (
                                      <Typography
                                        variant="caption"
                                        component="span"
                                        sx={{
                                          bgcolor: 'primary.main',
                                          color: 'white',
                                          px: 1,
                                          py: 0.25,
                                          borderRadius: 1,
                                          ml: 0.5,
                                        }}
                                      >
                                        Verified
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>
                              }
                              // render secondary as inline element (span) to avoid <div> inside <p>
                              secondary={
                                <Typography variant="body2" color="text.secondary" component="span">
                                  @{user.name}
                                </Typography>
                              }
                            />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}

          {/* Debug output appended below search */}
          <Paper variant="outlined" sx={{ mt: 2, p: 1, maxHeight: 120, overflow: 'auto', bgcolor: 'background.paper' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1 }}>Debug output</Typography>
            {debugLogs.length === 0 ? (
              <Typography variant="caption" color="text.secondary">No debug logs yet</Typography>
            ) : (
              debugLogs.map((line, idx) => (
                <Typography key={idx} variant="caption" sx={{ display: 'block' }}>{line}</Typography>
              ))
            )}
          </Paper>

          <Dialog open={showHowTo} onClose={() => setShowHowTo(false)} maxWidth="md" fullWidth>
            <DialogTitle>How to use</DialogTitle>
            <DialogContent dividers>
              <div dangerouslySetInnerHTML={{ __html: markdownToHtml(howToContent) }} />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setShowHowTo(false)}>Return to login</Button>
            </DialogActions>
          </Dialog>

          {/* NOTE: duplicate results list removed — results are shown above. */}
        </Paper>
      </Box>
    </Container>
  );
};

export default Login;
