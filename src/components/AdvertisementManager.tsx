// AdvertisementManager.tsx — UI for saving/loading/running Advertisement presets.
// Minimal UI: list saved ads, create new from current selection, play/stop.

import { useEffect, useState, useRef } from "react";
import { listen } from '@tauri-apps/api/event';
import { Box, IconButton, Typography, Avatar, Snackbar } from "@mui/material";
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DeleteIcon from '@mui/icons-material/Delete';
import { invoke } from '@tauri-apps/api/core';

export type Advertisement = {
  id: string;
  name: string;
  // support both frontend and rust field conventions
  player_id?: number;
  playerId?: number;
  roli_verification?: string | null;
  offer_item_ids?: number[]; // saved from App.tsx
  offer_catalog_ids?: number[]; // alternate name
  request_item_ids?: number[];
  request_tags?: string[];
  interval_minutes?: number;
  intervalMinutes?: number;
};


export default function AdvertisementManager({
  // optional signal to cause a refresh when parent saves an ad
  refreshSignal,
  appendLog,
}: {
  refreshSignal?: number;
  appendLog?: (line: string) => void;
}) {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [thumbsMap, setThumbsMap] = useState<Record<string, string[]>>({});
  const [offerThumbsMap, setOfferThumbsMap] = useState<Record<string, string[]>>({});
  const [hoverAdId, setHoverAdId] = useState<string | null>(null);
  const [globalInterval, setGlobalInterval] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('ads:globalInterval');
      return raw ? Number(raw) : 16;
    } catch { return 16; }
  });
  const [intervalWarning, setIntervalWarning] = useState(false);
  const [snackOpen, setSnackOpen] = useState(false);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});

  const refresh = async () => {
    try {
      const res = await invoke<any>('list_ads');
      setAds((res as any) || []);
    } catch (e) {
      console.error('Failed to list ads', e);
      setAds([]);
    }
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => { if (typeof refreshSignal !== 'undefined') refresh(); }, [refreshSignal]);

  const [runningIds, setRunningIds] = useState<string[]>([]);
  const refreshRunning = async () => {
    try {
      const res = await invoke<any>('list_running_ads');
      setRunningIds(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error('Failed to list running ads', e);
      setRunningIds([]);
    }
  };
  useEffect(() => { refreshRunning(); }, []);

  // Listen for ad posting events from the Rust runner and append formatted messages
  const appendRef = useRef<typeof appendLog | null>(null);
  useEffect(() => { appendRef.current = appendLog ?? null; }, [appendLog]);

  useEffect(() => {
    // register the listener once; guard against the async listen resolving after cleanup
    let unlisten: any = null;
    let cancelled = false;
    listen('ad:posted', (e: any) => {
      const payload = e.payload as any;
      const message = payload?.message ?? String(payload ?? '');
      if (message) appendRef.current?.(message);
    }).then((u) => {
      if (cancelled) {
        u();
      } else {
        unlisten = u;
      }
    }).catch((err) => console.error('Failed to listen for ad:posted', err));

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Tick countdowns every second for running ads
  useEffect(() => {
    const id = setInterval(() => {
      setCountdowns((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const [adId, sec] of Object.entries(prev)) {
          if (!runningIds.includes(adId)) {
            delete next[adId];
            changed = true;
            continue;
          }
          const n = Math.max(0, sec - 1);
          if (n !== sec) {
            next[adId] = n;
            changed = true;
          }
          if (n === 0) {
            // fire post-notification and reset countdown
            const ad = ads.find((x) => x.id === adId);
            if (ad) appendLog?.(`Posting ad ${ad.name}`);
            next[adId] = (globalInterval || 1) * 60;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [runningIds, ads, globalInterval, appendLog]);

  const formatCountdown = (id: string) => {
    const s = countdowns[id];
    if (s == null) return '';
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = Math.floor(s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  // Fetch thumbnails for ads (offer items) for quick preview
  useEffect(() => {
    const fetchThumbs = async () => {
      try {
        // collect catalog ids from either offer_item_ids/offer_catalog_ids and request_item_ids
        const allIds = Array.from(new Set(ads.flatMap((a) => ([...((a.offer_item_ids ?? a.offer_catalog_ids) || []), ...((a.request_item_ids ?? []) || [])]))));
        if (allIds.length === 0) {
          setThumbsMap({});
          return;
        }
        const res = await invoke<any>('get_catalog_items_by_ids', { ids: allIds });
        const items: any[] = res?.items ?? [];
        const map = new Map<number, any>();
        for (const it of items) map.set(it.id, it);
        const newMap: Record<string, string[]> = {};
        const newOfferMap: Record<string, string[]> = {};
        for (const a of ads) {
          const offerIds = ([...(a.offer_item_ids ?? a.offer_catalog_ids) || []]) as number[];
          const combinedIds = ([...((a.offer_item_ids ?? a.offer_catalog_ids) || []), ...((a.request_item_ids ?? []) || [])]) as number[];
          const offerThumbs = offerIds.map((cid) => map.get(cid)?.thumbnail).filter(Boolean) as string[];
          const thumbs = combinedIds.map((cid) => map.get(cid)?.thumbnail).filter(Boolean) as string[];
          newOfferMap[a.id] = offerThumbs;
          newMap[a.id] = thumbs;
        }
        setOfferThumbsMap(newOfferMap);
        setThumbsMap(newMap);
      } catch (e) {
        console.error('Failed to fetch thumbs for ads', e);
        setThumbsMap({});
      }
    };
    if (ads.length > 0) fetchThumbs();
  }, [ads]);


  const handleDelete = async (id: string) => {
    if (!confirm("Delete this advertisement preset?")) return;
    try {
      await invoke('delete_ad', { id });
      await refresh();
    } catch (e) {
      console.error('Failed to delete ad', e);
      alert('Failed to delete ad');
    }
  };

  if (!ads || ads.length === 0) {
    return (
      <Box sx={{ mb: 1, p: 1 }}>
        <Typography sx={{ color: 'rgba(255,255,255,0.75)' }}>No ads created</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ p: 1, bgcolor: '#2b3036', borderRadius: 1 }}>
        <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '0.95rem', mb: 1 }}>Ads manager</Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', gap: 1, mr: 1, flexDirection: 'column', alignItems: 'flex-start' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>Interval (min)</Typography>
              <input type="number" min={15} value={globalInterval} onChange={(e) => {
                const rawVal = Number(e.target.value || 15);
                const v = Math.max(15, rawVal);
                if (rawVal < 15) {
                  setIntervalWarning(true);
                  setSnackMessage('Minimum interval is 15 minutes');
                  setSnackOpen(true);
                  setTimeout(() => setIntervalWarning(false), 3000);
                }
                setGlobalInterval(v);
                try { localStorage.setItem('ads:globalInterval', String(v)); } catch {}
              }} style={{ width: 64, padding: 6, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'white' }} />
            </Box>
            {intervalWarning && <Typography sx={{ color: '#f59e0b', fontSize: '0.75rem' }}>Minimum interval is 15 minutes</Typography>}
          </Box>

          {ads.map((a) => {
        const running = runningIds.includes(a.id);
  // use offer-only thumbnails for the compact ad avatar stack
  const thumbs = (offerThumbsMap[a.id] ?? []) as string[];
        const interval = a.interval_minutes ?? a.intervalMinutes ?? 16;

        return (
          <Box key={a.id} sx={{ position: 'relative' }} onMouseEnter={() => setHoverAdId(a.id)} onMouseLeave={() => setHoverAdId(null)}>
            <Box sx={{ bgcolor: '#222833', p: 1, borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1, minWidth: 160, position: 'relative' }}>
              <Box sx={{ position: 'relative', display: 'inline-block', alignSelf: 'center', width: (() => {
                  const n = Math.min(4, Math.max(0, thumbs.length));
                  return n <= 0 ? 36 : 36 + (n - 1) * 18;
                })(), height: 36 }}>
                {thumbs.length > 0 ? (
                  thumbs.slice(0, 4).map((t, i) => (
                    <Avatar
                      key={i}
                      src={t}
                      sx={{
                        width: 36,
                        height: 36,
                        position: 'absolute',
                        left: i * 18,
                        zIndex: 100 + i,
                        border: '2px solid rgba(0,0,0,0.3)',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                      }}
                    />
                  ))
                ) : (
                  <Avatar sx={{ width: 36, height: 36, bgcolor: '#3a3f4a' }}>{a.name?.charAt(0) ?? '?'}</Avatar>
                )}
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <Typography sx={{ color: 'white', fontWeight: 600, fontSize: '0.85rem' }}>{a.name}</Typography>
                {!globalInterval && <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>{interval}m</Typography>}
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton size="small" onClick={async () => {
                  try {
                    if (running) {
                      await invoke('stop_ad', { id: a.id });
                      setCountdowns((s) => { const n = { ...s }; delete n[a.id]; return n; });
                      appendLog?.(`Stopped ad ${a.name}`);
                    } else {
                      // client-side guard: ensure globalInterval meets minimum
                      if ((globalInterval ?? 0) < 15) {
                        const msg = 'Interval must be at least 15 minutes';
                        appendLog?.(msg);
                        setSnackMessage(msg);
                        setSnackOpen(true);
                        return;
                      }
                      await invoke('start_ad', { id: a.id, interval_minutes: globalInterval });
                      setCountdowns((s) => ({ ...s, [a.id]: globalInterval * 60 }));
                      appendLog?.(`Started ad ${a.name} (every ${globalInterval}m)`);
                    }
                    await refreshRunning();
                  } catch (e) {
                    console.error('Failed to start/stop ad', e);
                    alert('Failed to start/stop ad');
                  }
                }} sx={{ color: running ? '#60a5fa' : 'white' }} title={running ? 'Stop' : 'Start'}>
                  {running ? <StopIcon /> : <PlayArrowIcon />}
                </IconButton>

                <Box sx={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem', minWidth: 56, textAlign: 'center' }}>{formatCountdown(a.id)}</Box>

                <IconButton size="small" onClick={() => handleDelete(a.id)} sx={{ color: 'white' }} title="Delete">
                  <DeleteIcon />
                </IconButton>
              </Box>
            </Box>

            {hoverAdId === a.id && (
              <Box sx={{ position: 'absolute', left: 8, top: '100%', mt: 0.5, bgcolor: '#111827', color: 'white', p: 1, borderRadius: 1, boxShadow: '0 4px 12px rgba(0,0,0,0.6)', zIndex: 1000, minWidth: 180 }}>
                <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                  {(thumbsMap[a.id] ?? []).map((t, i) => (
                    <Avatar key={i} src={t} sx={{ width: 36, height: 36 }} />
                  ))}
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {((a.request_tags ?? [])).map((tag: any, i: number) => (
                    <Box key={i} sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: 'white', px: 1, py: 0.5, borderRadius: 1, fontSize: '0.75rem' }}>{tag}</Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        );
      })}
        </Box>
      </Box>
      <Snackbar
        open={snackOpen}
        autoHideDuration={3000}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={snackMessage ?? ''}
      />
    </Box>
  );
}
