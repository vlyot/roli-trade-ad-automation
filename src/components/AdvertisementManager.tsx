// AdvertisementManager.tsx — UI for saving/loading/running Advertisement presets.
// Minimal UI: list saved ads, create new from current selection, play/stop.

import { useEffect, useState } from "react";
import { Box, IconButton, Typography, Avatar } from "@mui/material";
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
  const [globalInterval, setGlobalInterval] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('ads:globalInterval');
      return raw ? Number(raw) : 16;
    } catch { return 16; }
  });
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

  // Fetch thumbnails for ads (offer items) for quick preview
  useEffect(() => {
    const fetchThumbs = async () => {
      try {
        // collect catalog ids from either offer_item_ids or offer_catalog_ids
        const allIds = Array.from(new Set(ads.flatMap((a) => ((a.offer_item_ids ?? a.offer_catalog_ids) || []))));
        if (allIds.length === 0) {
          setThumbsMap({});
          return;
        }
        const res = await invoke<any>('get_catalog_items_by_ids', { ids: allIds });
        const items: any[] = res?.items ?? [];
        const map = new Map<number, any>();
        for (const it of items) map.set(it.id, it);
        const newMap: Record<string, string[]> = {};
        for (const a of ads) {
          const ids = (a.offer_item_ids ?? a.offer_catalog_ids) || [];
          const thumbs = ids.map((cid) => map.get(cid)?.thumbnail).filter(Boolean) as string[];
          newMap[a.id] = thumbs;
        }
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
    <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 1 }}>
        <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>Interval (min)</Typography>
        <input type="number" min={1} value={globalInterval} onChange={(e) => {
          const v = Math.max(1, Number(e.target.value || 1));
          setGlobalInterval(v);
          try { localStorage.setItem('ads:globalInterval', String(v)); } catch {}
        }} style={{ width: 64, padding: 6, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'white' }} />
      </Box>
      {ads.map((a) => {
        const running = runningIds.includes(a.id);
        const thumbs = thumbsMap[a.id] ?? [];
        const interval = a.interval_minutes ?? a.intervalMinutes ?? 16;
        return (
          <Box key={a.id} sx={{ bgcolor: '#222833', p: 1, borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1, minWidth: 160 }}>
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
              <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>{interval}m</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <IconButton size="small" onClick={async () => {
                try {
                  if (running) {
                    await invoke('stop_ad', { id: a.id });
                    // clear countdown
                    setCountdowns((s) => { const n = { ...s }; delete n[a.id]; return n; });
                    appendLog?.(`Stopped ad ${a.name}`);
                  } else {
                    await invoke('start_ad', { id: a.id, interval_minutes: globalInterval });
                    // start local countdown
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
              {/* countdown display */}
              <Box sx={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem', minWidth: 56, textAlign: 'center' }}>
                {countdowns[a.id] != null ? (() => {
                  const s = countdowns[a.id];
                  const mm = Math.floor(s / 60).toString().padStart(2, '0');
                  const ss = Math.floor(s % 60).toString().padStart(2, '0');
                  return `${mm}:${ss}`;
                })() : (running ? `${interval}m` : '')}
              </Box>
              <IconButton size="small" onClick={() => handleDelete(a.id)} sx={{ color: 'white' }} title="Delete">
                <DeleteIcon />
              </IconButton>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
