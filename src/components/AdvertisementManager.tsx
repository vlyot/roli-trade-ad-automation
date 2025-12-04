// AdvertisementManager.tsx — UI for saving/loading/running Advertisement presets.
// Minimal UI: list saved ads, create new from current selection, play/stop.

import { useEffect, useState, useRef } from "react";
import { listen } from '@tauri-apps/api/event';
import { Box, IconButton, Typography, Avatar, Snackbar, Dialog, DialogTitle, DialogContent, TextField, DialogActions, Button } from "@mui/material";
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
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
  const [verificationOpenFor, setVerificationOpenFor] = useState<string | null>(null);
  const [verificationInput, setVerificationInput] = useState<string>("");
  const [verificationPromptSource, setVerificationPromptSource] = useState<'missing' | 'post-error' | null>(null);
  const [verificationSubmitting, setVerificationSubmitting] = useState(false);
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const [authVerification, setAuthVerification] = useState<string | null>(null);
  const [runningIds, setRunningIds] = useState<string[]>([]);

  // load global auth verification if present
  useEffect(() => {
    (async () => {
      try {
        const res = await invoke<any>('load_auth_data');
        if (res && res.roli_verification) setAuthVerification(res.roli_verification as string);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

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

  // Verification dialog handlers
  const handleVerificationCancel = () => {
    setVerificationOpenFor(null);
    setVerificationInput("");
    setVerificationPromptSource(null);
  };

  const handleVerificationSubmit = async () => {
    const id = verificationOpenFor;
    if (!id) return;
    setVerificationSubmitting(true);
    try {
      const ad = ads.find((a) => a.id === id);
      if (!ad) throw new Error('Ad not found');
      const updatedAd = { ...ad, roli_verification: verificationInput } as any;
      // persist verification globally and on the ad
      try {
        await invoke('save_global_verification', { roli_verification: verificationInput });
        setAuthVerification(verificationInput);
      } catch (err) {
        // ignore if global save fails; still try to save ad
      }
      await invoke('save_ad', { ad: updatedAd });
      if (verificationPromptSource === 'missing') {
        // restart the runner so it will attempt an immediate post
        try { await invoke('stop_ad', { id }); } catch (_) {}
        await invoke('start_ad', { id, interval_minutes: Number.isFinite(globalInterval) ? globalInterval : undefined });
        setCountdowns((s) => ({ ...s, [id]: (Number.isFinite(globalInterval) ? globalInterval : 1) * 60 }));
        appendLog?.(`Saved verification and restarted ad ${ad.name}`);
        setVerificationOpenFor(null);
        setVerificationInput("");
        setVerificationPromptSource(null);
        await refreshRunning();
      } else {
        // post-error case: just save the token so the runner can retry on its schedule
        appendLog?.(`Saved verification for ad ${ad.name}; runner will retry on next schedule.`);
        setVerificationOpenFor(null);
        setVerificationInput("");
        setVerificationPromptSource(null);
      }
    } catch (e) {
      console.error('Failed to save verification and restart ad', e);
      let errMsg = 'Failed to save verification';
      try { if ((e as any)?.message) errMsg = (e as any).message; else errMsg = String(e); } catch {};
      setSnackMessage(errMsg);
      setSnackOpen(true);
      // leave dialog open so user can correct
    } finally {
      setVerificationSubmitting(false);
    }
  };

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
      const id = payload?.id;
      const errorKind = payload?.error_kind as string | undefined;
      const reason = payload?.reason as string | undefined;
      const nextWaitMins = payload?.next_wait_mins as number | undefined;

      // Always append the human-friendly message to the app log
      if (message) appendRef.current?.(message + (reason ? ` — ${reason}` : ''));

      // Update countdown with actual interval from backend
      if (id && nextWaitMins != null) {
        setCountdowns((s) => ({ ...s, [id]: nextWaitMins * 60 }));
      }

      // If runner skipped posting due to missing verification, prompt the user and stop the runner
      if (message === 'trade ad post skipped (no roli_verification)' && id) {
        if (verificationOpenFor !== id) {
          (async () => {
            try {
              await invoke('stop_ad', { id });
            } catch (e) {
              // ignore stop errors
            }
            setCountdowns((s) => { const n = { ...s }; delete n[id]; return n; });
            try { await refreshRunning(); } catch {}
          })();
          const ad = (ads || []).find((a) => a.id === id);
          setVerificationInput((authVerification ?? (ad?.roli_verification as string) ?? ''));
          setVerificationPromptSource('missing');
          setVerificationOpenFor(id);
        }
      }

      // Only prompt for verification if the runner explicitly marked the error as verification-related
      if (errorKind === 'verification' && id) {
        if (verificationOpenFor !== id) {
          (async () => {
            try { await invoke('stop_ad', { id }); } catch (e) {}
            setCountdowns((s) => { const n = { ...s }; delete n[id]; return n; });
            try { await refreshRunning(); } catch {}
          })();
          const ad = (ads || []).find((a) => a.id === id);
          setVerificationInput((authVerification ?? (ad?.roli_verification as string) ?? ''));
          setVerificationPromptSource('missing');
          setVerificationOpenFor(id);
        }
      }

      // If a non-verification error occurred but the ad has no verification saved, offer a prompt
      // so the user can enter a verification token and allow future retries. Do NOT stop the runner here;
      // the runner should continue its retry schedule.
      if (errorKind === 'other' && id) {
        const ad = (ads || []).find((a) => a.id === id);
        const adHasVerification = !!(ad?.roli_verification && String(ad?.roli_verification).trim());
        if (!adHasVerification && verificationOpenFor !== id) {
          // open a lightweight prompt explaining the post was blocked by a server-side constraint
          // and offer a field to save the verification so the runner can resume attempts later.
          setVerificationInput((authVerification ?? (ad?.roli_verification as string) ?? ''));
          setVerificationPromptSource('post-error');
          setVerificationOpenFor(id);
        }
      }
      // For non-verification failures, do not prompt — logs above are sufficient for diagnosis.
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
  }, [ads, authVerification, verificationOpenFor, appendLog]);
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
            // fire post-notification
            const ad = ads.find((x) => x.id === adId);
            if (ad) appendLog?.(`Posting ad ${ad.name}`);
            // Don't reset here - wait for backend event with actual next_wait_mins
            // This prevents showing incorrect countdown when backend uses different interval
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

  const handleSaveGlobalInterval = async () => {
    try {
      // Validate interval
      if (globalInterval < 15) {
        setSnackMessage('Interval must be at least 15 minutes');
        setSnackOpen(true);
        return;
      }

      // Update all ads with the new global interval
      for (const ad of ads) {
        const updatedAd = { ...ad, interval_minutes: globalInterval };
        await invoke('save_ad', { ad: updatedAd });
      }

      await refresh();
      setSnackMessage('Global interval saved for all ads');
      setSnackOpen(true);
      appendLog?.(`Updated global interval to ${globalInterval}m for all ads`);
    } catch (e) {
      console.error('Failed to save global interval', e);
      let errMsg = 'Failed to save global interval';
      try { if ((e as any)?.message) errMsg = (e as any).message; else errMsg = String(e); } catch {};
      setSnackMessage(errMsg);
      setSnackOpen(true);
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
              <IconButton
                size="small"
                onClick={handleSaveGlobalInterval}
                sx={{ color: 'white', padding: '6px' }}
                title="Save interval for all ads"
              >
                <SaveIcon sx={{ fontSize: '1.2rem' }} />
              </IconButton>
            </Box>
            {intervalWarning && <Typography sx={{ color: '#f59e0b', fontSize: '0.75rem' }}>Minimum interval is 15 minutes</Typography>}
          </Box>

          {ads.map((a) => {
        const running = runningIds.includes(a.id);
  // use offer-only thumbnails for the compact ad avatar stack
  const thumbs = (offerThumbsMap[a.id] ?? []) as string[];

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
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton size="small" onClick={async () => {
                  try {
                    if (running) {
                      await invoke('stop_ad', { id: a.id });
                      setCountdowns((s) => { const n = { ...s }; delete n[a.id]; return n; });
                      appendLog?.(`Stopped ad ${a.name}`);
                    } else {
                      // Use the global interval for all ads
                      if (!Number.isFinite(globalInterval) || globalInterval < 15) {
                        const msg = 'No posting interval specified. Set a global interval in the Ads manager or provide an interval_minutes when starting the ad.';
                        appendLog?.(msg);
                        setSnackMessage(msg);
                        setSnackOpen(true);
                        return;
                      }
                      // If this ad lacks a roli_verification, prompt the user unless a global one exists.
                      const hasAdVerification = !!(a.roli_verification && String(a.roli_verification).trim());
                      if (!hasAdVerification) {
                        if (authVerification && authVerification.trim()) {
                          // copy global verification into the ad so it can start without a prompt
                          const updatedAd = { ...a, roli_verification: authVerification } as any;
                          try {
                            await invoke('save_ad', { ad: updatedAd });
                            setAds((prev) => prev.map((x) => x.id === a.id ? updatedAd : x));
                            appendLog?.(`Copied global verification to ad ${a.name}`);
                          } catch (saveErr) {
                            // If save fails, don't proceed — show error and bail
                            const errMsg = `Failed to save verification to ad: ${String(saveErr)}`;
                            console.error(errMsg, saveErr);
                            appendLog?.(errMsg);
                            setSnackMessage(errMsg);
                            setSnackOpen(true);
                            return;
                          }
                        } else {
                          // No per-ad verification and no global token — open verification dialog instead of starting
                          setVerificationInput("");
                          setVerificationPromptSource('missing');
                          setVerificationOpenFor(a.id);
                          return;
                        }
                      }
                      await invoke('start_ad', { id: a.id, interval_minutes: globalInterval });
                      setCountdowns((s) => ({ ...s, [a.id]: globalInterval * 60 }));
                      appendLog?.(`Started ad ${a.name} (every ${globalInterval}m)`);
                    }
                    await refreshRunning();
                  } catch (e) {
                      // Extract a readable message from the thrown error and show it to the user.
                      let errMsg = 'Failed to start/stop ad';
                      try {
                        if (typeof e === 'string') errMsg = e;
                        else if ((e as any)?.message) errMsg = (e as any).message;
                        else errMsg = JSON.stringify(e);
                      } catch (_) {}
                      console.error('Failed to start/stop ad', e);
                      // Surface the real error in the app UI since production builds don't show a console
                      appendLog?.(errMsg);
                      setSnackMessage(errMsg);
                      setSnackOpen(true);
                      // keep the alert for visibility in case Snackbar is missed
                      alert(errMsg);
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
      <Dialog open={!!verificationOpenFor} onClose={handleVerificationCancel} fullWidth maxWidth="sm">
        <DialogTitle>{verificationPromptSource === 'post-error' ? 'Posting blocked — enter verification (optional)' : 'Roli verification required'}</DialogTitle>
        <DialogContent>
          {verificationPromptSource === 'post-error' ? (
            <Typography sx={{ mb: 1 }}>A server-side error prevented this ad from posting (for example: 24-hour limit or cooldown). This ad currently has no saved <code>roli_verification</code> cookie — entering one now will allow the runner to retry posting on its next scheduled attempt. This will not restart or stop the runner immediately.</Typography>
          ) : (
            <Typography sx={{ mb: 1 }}>This ad needs a Roli verification cookie to post. Paste it below and press Save to try posting again.
              Go to <a href="https://rolimons.com" target="_blank" rel="noopener noreferrer">rolimons.com</a>, open your browser's developer tools (usually F12/inspect element), and find the value of the <code>roli_verification</code> cookie.
            </Typography>
          )}
          <Box sx={{ mt: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <img
              src="/images/cookie-1.png"
              alt="Example roli_verification cookie (example 1)"
              style={{ height: 64, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <img
              src="/images/cookie-2.png"
              alt="Example roli_verification cookie (example 2)"
              style={{ height: 64, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <img
              src="/images/cookie-3.png"
              alt="Example roli_verification cookie (example 3)"
              style={{ height: 64, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </Box>
          <TextField
            label="Roli verification cookie"
            value={verificationInput}
            onChange={(e) => setVerificationInput(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            placeholder="Paste your roli_verification cookie here"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleVerificationCancel} disabled={verificationSubmitting}>Cancel</Button>
          <Button onClick={handleVerificationSubmit} disabled={verificationSubmitting || !verificationInput} variant="contained">{verificationPromptSource === 'post-error' ? 'Save' : 'Save & Try'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
