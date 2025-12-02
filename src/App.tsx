import { useState, useEffect, ChangeEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Box, Button, Card, CardContent, Typography, Chip, ThemeProvider, createTheme, CssBaseline, IconButton, CircularProgress, Avatar, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import { Logout as LogoutIcon } from "@mui/icons-material";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { markdownToHtml } from "./utils/markdown";
import LoginFlow from "./components/LoginFlow";
import OfferSlots from "./components/OfferSlots";
import RequestSlots from "./components/RequestSlots";
import SelectorButtons from "./components/SelectorButtons";
import SearchBar from "./components/SearchBar";
import ItemsGrid from "./components/ItemsGrid";
import PaginationControls from "./components/PaginationControls";
// PlayerAndCookieInputs will be shown only on-demand when verification is required
import TerminalLogs from "./components/TerminalLogs";
import AdvertisementManager from "./components/AdvertisementManager";
// InventoryPicker removed: inventory will load automatically and be enriched from catalog data

// Helper: wrap Tauri invoke with timeout to prevent indefinite waiting
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs))
  ]);
}

interface TradeAdRequest {
  player_id: number;
  offer_item_ids: number[];
  request_item_ids: number[];
  request_tags: string[];
  roli_verification: string;
}

const AVAILABLE_TAGS = ["any", "demand", "rares", "rap", "robux", "upgrade", "downgrade", "wishlist", "projecteds", "adds"];

// NOTE: inventory is now loaded at runtime into `inventoryItems` state

const darkTheme = createTheme({ palette: { mode: "dark", primary: { main: "#3b82f6" }, background: { default: "#3a4049", paper: "#3a4049" } } });

function MainApp() {
  const { authData, logout: authLogout, updateRoliVerification } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [roliVerification, setRoliVerification] = useState("");
  const [offerItems, setOfferItems] = useState<number[]>([]);
  const [requestItems, setRequestItems] = useState<number[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [catalogItems, setCatalogItems] = useState<Array<{ id: number; name: string; abbreviation?: string | null; rap: number; value: number }>>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const PER_PAGE = 30;

  // Auto-load user_id and roli_verification from auth data
  useEffect(() => {
    if (authData) {
      setPlayerId(authData.user_id.toString());
      if (authData.roli_verification) {
        setRoliVerification(authData.roli_verification);
      }
      // fetch avatar thumbnail for header (use lazy thumbnail endpoint)
      (async () => {
        try {
          const map: Record<string, string> = await withTimeout(
            invoke('fetch_thumbnails_for_ids_cmd', { ids: [Number(authData.user_id)] }),
            5000,
            'Fetch avatar thumbnail'
          );
          const url = map?.[String(authData.user_id)];
          if (url) setAvatarUrl(url);
        } catch (e) {
          // ignore avatar fetch failures
        }
      })();
    }
  }, [authData]);
  // full-catalog cache per search term to enable instant client-side pagination
  // key: searchValue ('' for no search) -> { items: rawItems[], total }
  const catalogFullCache = (globalThis as any)._catalogFullCacheRef || { current: new Map<string, { items: any[]; total: number }>() };
  (globalThis as any)._catalogFullCacheRef = catalogFullCache;

  const [isLoading, setIsLoading] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<Array<any>>([]);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [showHowTo, setShowHowTo] = useState(false);
  const [howToContent, setHowToContent] = useState<string>("");
  const [showVerificationPrompt, setShowVerificationPrompt] = useState(false);
  const [selectorMode, setSelectorMode] = useState<"offer" | "request">("offer");
  const [searchValue, setSearchValue] = useState("");

  const appendLog = (line: string) => setTerminalLogs((prev) => [...prev, line].slice(-200));

  // Advertisement refresh signal for manager
  const [adsRefreshSignal, setAdsRefreshSignal] = useState<number>(0);

  // Ensure Offer and Request item lists are strictly decoupled.
  // Build two independent arrays:
  // - inventoryDisplay: instance-level items for the Offer selector (enriched with catalog metadata)
  // - catalogRemaining: full catalog minus items already present in the user's inventory (for Request selector)
  const searchKey = searchValue || "";
  const catalogAll: any[] = (catalogFullCache.current.get(searchKey)?.items ?? catalogFullCache.current.get("")?.items ?? catalogItems) as any[];
  const inventoryDisplay = inventoryItems
    .map((inv) => ({ id: inv.id as number, name: inv.name ?? "", abbreviation: inv.abbreviation ?? null, rap: inv.rap ?? 0, value: inv.value ?? 0, thumbnail: inv.thumbnail ?? null }))
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  // Build a lookup of catalog id -> metadata for use in slot renderers (request slots)
  const catalogMap = new Map<number, any>();
  for (const entry of catalogFullCache.current.values()) {
    for (const ci of entry.items) catalogMap.set(ci.id, ci);
  }
  for (const ci of catalogItems) catalogMap.set(ci.id, ci);
  for (const inv of inventoryItems) {
    const cid = Number(inv.catalog_id ?? inv.catalogId ?? inv.catalog);
    if (cid) {
      const prev = catalogMap.get(cid) ?? {};
      catalogMap.set(cid, { ...prev, thumbnail: inv.thumbnail ?? prev.thumbnail, name: inv.name ?? prev.name, abbreviation: inv.abbreviation ?? prev.abbreviation, rap: inv.rap ?? prev.rap, value: inv.value ?? prev.value });
    }
  }

  // Do not exclude user-owned items from the catalog; users may request items they already own.
  const catalogRemaining = catalogAll;

  // Pagination for Request mode: show PER_PAGE items per page from catalogRemaining
  let displayedItems: any[] = [];
  if (selectorMode === "offer") {
    displayedItems = inventoryDisplay;
  } else {
    const total = catalogRemaining.length;
    const maxPage = Math.max(1, Math.ceil(total / PER_PAGE));
    // clamp catalogPage
    const safePage = Math.min(Math.max(1, catalogPage), maxPage);
    const start = (safePage - 1) * PER_PAGE;
    displayedItems = catalogRemaining.slice(start, start + PER_PAGE).map((it: any) => ({ id: it.id, name: it.name, abbreviation: it.abbreviation ?? null, rap: it.rap, value: it.value, thumbnail: it.thumbnail ?? null }));
  }

  const filteredItems = displayedItems.filter((item) => (item.name || "").toLowerCase().includes(searchValue.toLowerCase()) || ((item as any).abbreviation || "").toLowerCase().includes(searchValue.toLowerCase()));

  // Keep catalogTotal in sync with the remaining catalog size when in request mode
  useEffect(() => {
    if (selectorMode === "request") {
      setCatalogTotal(catalogRemaining.length);
      const maxPage = Math.max(1, Math.ceil(catalogRemaining.length / PER_PAGE));
      if (catalogPage > maxPage) setCatalogPage(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectorMode, catalogRemaining.length]);

  // Effect A: when selectorMode/request or searchValue changes, fetch entire result once and cache it
  useEffect(() => {
    if (selectorMode !== "request") return;
    const key = searchValue || "";
    let active = true;

    const fetchAll = async () => {
      // if cached, set page 1 slice and return
      if (catalogFullCache.current.has(key)) {
        const cached = catalogFullCache.current.get(key)!;
        setCatalogTotal(cached.total || cached.items.length);
  const slice = cached.items.slice(0, PER_PAGE).map((it: any) => ({ id: it.id, name: it.name, abbreviation: it.abbreviation ?? null, rap: it.rap, value: it.value, thumbnail: it.thumbnail ?? null }));
        setCatalogItems(slice);
        appendLog(`Loaded ${slice.length} items (from full-cache) for '${key || '<all>'}'`);
        return;
      }

      appendLog(`Fetching full catalog for '${key || '<all>'}' (this may take a moment)...`);
      try {
        if (typeof invoke !== "function") {
          appendLog("Tauri invoke() unavailable");
          setCatalogItems([]);
          setCatalogTotal(0);
          return;
        }

  // Ask the backend for a cached full catalog for this search term
  const resAll: any = await withTimeout(
    invoke("get_full_catalog", { search: searchValue || null }),
    30000,
    "Fetch catalog"
  );
        if (!active) return;
        if (!resAll || !Array.isArray(resAll.items)) {
          setCatalogItems([]);
          setCatalogTotal(0);
          appendLog("No items returned from catalog API");
          return;
        }

  // filter out items with 0 RAP
  const rawItems: any[] = resAll.items;
  const allItems = rawItems.filter((it: any) => Number(it?.rap || 0) > 0);
  const total = allItems.length;
  catalogFullCache.current.set(key, { items: allItems, total });
        // set the first page slice
  const mapped = allItems.slice(0, PER_PAGE).map((it: any) => ({ id: it.id, name: it.name, abbreviation: it.abbreviation ?? null, rap: it.rap, value: it.value, thumbnail: it.thumbnail ?? null }));
        setCatalogItems(mapped);
        setCatalogTotal(total || allItems.length);
        appendLog(`Fetched full catalog in one call: ${allItems.length} items for '${key || '<all>'}'`);
      } catch (err: any) {
        setCatalogItems([]);
        setCatalogTotal(0);
        const msg = err?.message ?? err?.toString() ?? String(err);
        appendLog(`Failed to fetch catalog: ${msg}`);
        if (msg.includes('timed out')) {
          appendLog('Request timed out. Check your network or try again.');
        }
      }
    };

    fetchAll();
    return () => { active = false; };
  }, [selectorMode, searchValue]);

  // Effect B: when page changes, if we have a full-cache use it to slice and display instantly
  useEffect(() => {
    if (selectorMode !== "request") return;
    const key = searchValue || "";
    if (!catalogFullCache.current.has(key)) return; // not cached yet
    const cached = catalogFullCache.current.get(key)!;
    const start = (catalogPage - 1) * PER_PAGE;
  const slice = cached.items.slice(start, start + PER_PAGE).map((it: any) => ({ id: it.id, name: it.name, abbreviation: it.abbreviation ?? null, rap: it.rap, value: it.value, thumbnail: it.thumbnail ?? null }));
    setCatalogItems(slice);
    setCatalogTotal(cached.total || cached.items.length);
    appendLog(`Displayed page ${catalogPage} (cached)`);
  }, [catalogPage, selectorMode, searchValue]);

  // Compute offer/request totals by looking up instance ids first in the loaded inventory
  // and falling back to the catalog metadata when available.
  const offerValue = offerItems.reduce((sum, id) => {
    const inv = inventoryItems.find((i) => i.id === id);
    if (inv) return sum + (inv.value || 0);
    const cat = catalogItems.find((i) => i.id === id);
    return sum + (cat ? cat.value : 0);
  }, 0);
  const offerRAP = offerItems.reduce((sum, id) => {
    const inv = inventoryItems.find((i) => i.id === id);
    if (inv) return sum + (inv.rap || 0);
    const cat = catalogItems.find((i) => i.id === id);
    return sum + (cat ? cat.rap : 0);
  }, 0);

  const requestValue = requestItems.reduce((sum, id) => {
    const inv = inventoryItems.find((i) => i.id === id);
    if (inv) return sum + (inv.value || 0);
    const cat = catalogItems.find((i) => i.id === id);
    return sum + (cat ? cat.value : 0);
  }, 0);
  const requestRAP = requestItems.reduce((sum, id) => {
    const inv = inventoryItems.find((i) => i.id === id);
    if (inv) return sum + (inv.rap || 0);
    const cat = catalogItems.find((i) => i.id === id);
    return sum + (cat ? cat.rap : 0);
  }, 0);

  // Load inventory + targeted enrichment logic
  const loadInventory = async (pidNum?: number) => {
    const pid = pidNum ?? (playerId ? Number(playerId) : 0);
    if (!pid) {
      setInventoryItems([]);
      return;
    }
    setIsEnriching(true);
    appendLog(`Loading inventory for player ${pid}...`);
    try {
      // Use backend-enriched inventory which returns inventory items with catalog metadata merged
      const res: any = await withTimeout(
        invoke("fetch_enriched_inventory", { playerId: pid }),
        20000,
        "Load inventory"
      );
      const itemsArr: any[] = (res && Array.isArray(res.items)) ? res.items : [];
      if (itemsArr.length === 0) {
        appendLog("No inventory returned");
        setInventoryItems([]);
        setIsEnriching(false);
        return;
      }
      // Normalize to expected shape (instance id as id, catalog_id numeric)
      const mapped = itemsArr.map((it: any) => ({ id: it.instance_id ?? it.id ?? null, catalog_id: Number(it.catalog_id ?? it.catalogId ?? it.catalog ?? it.catalog_id), held: !!it.held, name: it.name ?? null, abbreviation: it.abbreviation ?? null, rap: it.rap ?? 0, value: it.value ?? 0, thumbnail: it.thumbnail ?? null }));
      setInventoryItems(mapped.filter((e: any) => e.id != null));
      appendLog(`Inventory loaded: ${mapped.length} items`);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      appendLog(`Failed to load inventory: ${msg}`);
      if (msg.includes('timed out')) {
        appendLog('Inventory fetch timed out. Check network or try again.');
      }
      setInventoryItems([]);
    } finally {
      setIsEnriching(false);
    }
  };

  useEffect(() => {
    if (!playerId) return;
    loadInventory(Number(playerId));
  }, [playerId]);

  // Periodic refresh (TTL) — refresh inventory every 20 minutes while logged in
  useEffect(() => {
    if (!playerId) return;
    const id = setInterval(() => {
      loadInventory(Number(playerId));
    }, 20 * 60 * 1000);
    return () => clearInterval(id);
  }, [playerId]);

  // Prefetch the full catalog on app start so the Request view has the full item list available.
  useEffect(() => {
    let active = true;
    const prefetchCatalog = async () => {
      const key = ""; // default cache key for unfiltered catalog
      if (catalogFullCache.current.has(key)) return;
      appendLog("Prefetching full catalog for app startup...");
      try {
        const resAll: any = await withTimeout(
          invoke("get_full_catalog", { search: null }),
          30000,
          "Prefetch catalog"
        );
        if (!active) return;
        if (!resAll || !Array.isArray(resAll.items)) {
          appendLog("Prefetch: no items returned from catalog API");
          return;
        }
        const rawItems: any[] = resAll.items;
        const allItems = rawItems.filter((it: any) => Number(it?.rap || 0) > 0);
        catalogFullCache.current.set(key, { items: allItems, total: allItems.length });
        // set first page for immediate UI
        const mapped = allItems.slice(0, PER_PAGE).map((it: any) => ({ id: it.id, name: it.name, abbreviation: it.abbreviation ?? null, rap: it.rap, value: it.value, thumbnail: it.thumbnail ?? null }));
        setCatalogItems(mapped);
        setCatalogTotal(allItems.length);
        appendLog(`Prefetch complete: ${allItems.length} catalog items loaded`);
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        appendLog(`Prefetch failed: ${msg}`);
        if (msg.includes('timed out')) {
          appendLog('This may indicate a slow network or backend issue. Try refreshing.');
        }
      }
    };
    prefetchCatalog();
    return () => { active = false; };
  }, []);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length + requestItems.length >= 4 ? prev : [...prev, tag]));
  };

  const addItem = (itemId: number) => {
    if (selectorMode === "offer") {
      // Offer expects instance IDs (from inventory). itemId here should be an instance id.
      setOfferItems((prev) => (prev.length >= 4 || prev.includes(itemId) ? prev : [...prev, itemId]));
    } else {
      // Request expects catalog IDs. If the clicked id is actually an inventory instance id,
      // translate it to the catalog id for request use. Otherwise assume it's already a catalog id.
      const inv = inventoryItems.find((i) => i.id === itemId);
      const catalogIdToAdd = inv ? Number(inv.catalog_id || inv.catalog_id) : itemId;
      setRequestItems((prev) => (prev.length + selectedTags.length >= 4 || prev.includes(catalogIdToAdd) ? prev : [...prev, catalogIdToAdd]));
    }
  };

  const computeOfferCatalogIds = (): number[] => {
    const mapped: number[] = offerItems
      .map((instId) => {
        const inv = inventoryItems.find((i) => i.id === instId);
        return inv ? Number(inv.catalog_id ?? inv.catalogId ?? inv.catalog_id) : instId;
      })
      .filter((id) => !!id);
    return mapped;
  };

  async function postTradeAdRequest(request: TradeAdRequest) {
    setIsLoading(true);
    appendLog("Posting trade ad...");
    try {
      if (typeof invoke !== "function") {
        appendLog("Tauri invoke() unavailable — cannot post");
        return null;
      }
      const response = await invoke<any>("post_trade_ad", { request });
      // Save roli_verification on successful post (or if error is NOT about invalid token)
      if (response && response.success && authData && request.roli_verification.trim() !== authData.roli_verification) {
        try {
          await updateRoliVerification(request.roli_verification.trim());
          appendLog("Roli verification saved for future use");
        } catch (e) {
          appendLog(`Warning: Could not save roli_verification: ${e}`);
        }
      }
      if (response && Array.isArray(response.logs)) setTerminalLogs(response.logs);
      else if (response && response.logs) setTerminalLogs(Array.isArray(response.logs) ? response.logs : [String(response.logs)]);
      else appendLog("Success!");
      // If backend indicates a verification problem, prompt the user for Roli verification cookie
      const logsArr: string[] = response?.logs ?? [];
      const joined = logsArr.join('\n').toLowerCase();
      if (!response?.success && joined.includes('verification')) {
        setShowVerificationPrompt(true);
        // clear any stored roli verification locally to force re-entry
        setRoliVerification('');
        appendLog('Roli verification required — enter your cookie to continue');
      } else {
        // clear prompt on success
        if (response?.success) setShowVerificationPrompt(false);
      }
      return response;
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      setTerminalLogs([errMsg]);
      if (errMsg.toLowerCase().includes("roli") && errMsg.toLowerCase().includes("verification")) {
        setRoliVerification("");
        appendLog("Please enter a valid Roli Verification cookie");
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  const handleSubmit = async () => {
    setIsLoading(true);
    setTerminalLogs([]);
    appendLog("Connecting...");
    try {
      const playerIdNum = parseInt(playerId || (authData ? String(authData.user_id) : "0"));
      if (isNaN(playerIdNum) || playerIdNum <= 0) throw new Error("Please enter a valid player ID or login");
      if (offerItems.length === 0) throw new Error("Please add at least one offer item");
      if (requestItems.length + selectedTags.length === 0) throw new Error("Please add at least one request item or tag");
      // Do not require roliVerification upfront; backend will prompt if needed

      const offer_item_ids_mapped = computeOfferCatalogIds();
      appendLog(`Mapped ${offerItems.length} offer instances -> ${offer_item_ids_mapped.length} catalog ids`);

      const request: TradeAdRequest = {
        player_id: playerIdNum,
        offer_item_ids: offer_item_ids_mapped,
        request_item_ids: requestItems,
        request_tags: selectedTags.map((t) => t.toLowerCase()),
        roli_verification: roliVerification.trim(),
      };
      await postTradeAdRequest(request);
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      setTerminalLogs([errMsg]);
      if (errMsg.toLowerCase().includes("roli") && errMsg.toLowerCase().includes("verification")) {
        setRoliVerification("");
        setShowVerificationPrompt(true);
        appendLog("Please enter a valid Roli Verification cookie");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Note: building/posting from saved ads is handled in the Rust backend runner now.

  // Scheduling and running of ads moved to Rust backend (ads_runner). Manager will call start_ad/stop_ad.

  // Use shared markdown renderer from src/utils/markdown.ts

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: "100vh", bgcolor: "#3a4049", p: 2 }}>
        <Card sx={{ maxWidth: 1000, mx: "auto", bgcolor: "#3a4049", boxShadow: "none" }}>
          <CardContent sx={{ p: 2 }}>

            {/* Welcome message and logout */}
            {authData && (
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, p: 1.5, bgcolor: "#4a525c", borderRadius: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Avatar src={avatarUrl ?? undefined} sx={{ width: 36, height: 36 }} />
                  <Typography variant="subtitle1" sx={{ color: "white", fontWeight: 500 }}>
                    Welcome, {authData.display_name}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Button variant="outlined" size="small" onClick={async () => {
                    setShowHowTo(true);
                    try {
                      // fetch the markdown content from the public folder
                      const resp = await fetch('/how-to-use.md');
                      if (resp.ok) {
                        const txt = await resp.text();
                        setHowToContent(txt);
                      } else {
                        setHowToContent('Could not load guide.');
                      }
                    } catch (e) {
                      setHowToContent('Could not load guide.');
                    }
                  }} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.12)' }}>How to use</Button>
                  <IconButton onClick={authLogout} size="small" sx={{ color: "white" }} title="Logout">
                    <LogoutIcon />
                  </IconButton>
                </Box>
              </Box>
            )}

            {/* Advertisement manager: saved ads and controls — placed above Offer/Request */}
            <AdvertisementManager refreshSignal={adsRefreshSignal} appendLog={appendLog} />

            {/* How-to dialog: shows markdown guide loaded from public/how-to-use.md */}
            <Dialog open={showHowTo} onClose={() => setShowHowTo(false)} maxWidth="md" fullWidth>
              <DialogTitle>How to use</DialogTitle>
              <DialogContent dividers sx={{ bgcolor: 'transparent' }}>
                {/* Render parsed markdown so images and formatting appear correctly. Images should be placed under public/images/ and referenced by relative paths in the markdown. */}
                {howToContent ? (
                  <Box sx={{ color: 'white' }}>
                    {/* Simple markdown -> HTML renderer for the guide. This supports headings, images, lists and paragraphs. */}
                    <div dangerouslySetInnerHTML={{ __html: markdownToHtml(howToContent) }} />
                  </Box>
                ) : (
                  <Box sx={{ color: 'white' }}>Loading...</Box>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setShowHowTo(false)} sx={{ color: 'white' }}>Return to app</Button>
              </DialogActions>
            </Dialog>

            <Box sx={{ mb: 1 }}>
              <Typography variant="h6" sx={{ textAlign: "center", mb: 1, color: "white", fontSize: "1.1rem" }}>Offer</Typography>
              <OfferSlots offerItems={offerItems} onRemove={(idx) => setOfferItems((s) => s.filter((_, i) => i !== idx))} inventoryItems={inventoryItems} />
              {/* Inventory loads automatically; manual Select button removed */}
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 1 }}>
                <Button variant="outlined" size="small" onClick={() => loadInventory(Number(playerId))} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.12)' }}>Refresh Inventory</Button>
                {isEnriching && <CircularProgress size={20} sx={{ color: 'white' }} />}
              </Box>
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="body2" sx={{ color: "#60a5fa", fontSize: "0.85rem" }}>Value {offerValue.toLocaleString()}</Typography>
                <Typography variant="body2" sx={{ color: "#60a5fa", fontSize: "0.85rem" }}>RAP {offerRAP.toLocaleString()}</Typography>
              </Box>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" sx={{ textAlign: "center", mb: 1, color: "white", fontSize: "1.1rem" }}>Request</Typography>
              <RequestSlots requestItems={requestItems} selectedTags={selectedTags} onRemoveItem={(idx) => setRequestItems((s) => s.filter((_, i) => i !== idx))} onRemoveTag={(tag) => setSelectedTags((s) => s.filter((t) => t !== tag))} catalogMap={catalogMap} />
              <Box sx={{ textAlign: "center", mb: 2 }}>
                <Typography variant="body2" sx={{ color: "#60a5fa", fontSize: "0.85rem" }}>Value {requestValue.toLocaleString()}</Typography>
                <Typography variant="body2" sx={{ color: "#60a5fa", fontSize: "0.85rem" }}>RAP {requestRAP.toLocaleString()}</Typography>
              </Box>
              <Box sx={{ textAlign: "center", mb: 2, display: 'flex', justifyContent: 'center', gap: 1 }}>
                <Button variant="contained" onClick={handleSubmit} disabled={isLoading} sx={{ bgcolor: "#4a525c", color: "white", px: 4, py: 0.75, textTransform: "none", fontSize: "1rem", "&:hover": { bgcolor: "#5a626c" }, "&:disabled": { bgcolor: "#3a424c", color: "#999" } }}>{isLoading ? "Posting..." : "Submit"}</Button>
                <Button variant="outlined" onClick={async () => {
                  // Save current selection as an ad (auto-named)
                  try {
                    const existing: any = await invoke('list_ads');
                    const count = Array.isArray(existing) ? existing.length : 0;
                    const name = `Ad ${count + 1}`;
                    const ad = {
                      id: Math.random().toString(36).slice(2, 10),
                      name,
                      player_id: Number(playerId || authData?.user_id || 0),
                      roli_verification: roliVerification || null,
                      offer_item_ids: computeOfferCatalogIds(),
                      request_item_ids: requestItems,
                      request_tags: selectedTags,
                      // 0 means inherit the global interval (set in Ads manager)
                      interval_minutes: 0,
                    };
                    await invoke('save_ad', { ad });
                    setAdsRefreshSignal((s) => s + 1);
                    appendLog(`Saved advertisement '${name}'`);
                  } catch (e) {
                    appendLog(`Failed to save advertisement: ${String(e)}`);
                  }
                }} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.12)' }}>Save as ad</Button>
              </Box>
            </Box>

            <SelectorButtons mode={selectorMode} onChange={(m) => { setSelectorMode(m); if (m === 'request') setCatalogPage(1); }} />

            <SearchBar
              value={searchValue}
              placeholder={selectorMode === "offer" ? "Search your inventory" : "Search the catalog"}
              onDebouncedChange={(v) => {
                setSearchValue(v);
                // if user starts a catalog search (2+ chars) switch to request mode and reset page
                if (v && v.length >= 2) {
                  if (selectorMode !== "request") setSelectorMode("request");
                  setCatalogPage(1);
                }
              }}
            />

            {selectorMode === "request" && (
              <Box sx={{ mb: 1 }}>
                <PaginationControls page={catalogPage} total={catalogTotal} perPage={PER_PAGE} onPage={setCatalogPage} />
              </Box>
            )}

            {selectorMode === "request" && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, justifyContent: "center", mb: 2 }}>
                {AVAILABLE_TAGS.map((tag) => (
                  <Chip key={tag} label={tag.toUpperCase()} onClick={() => toggleTag(tag)} sx={{ bgcolor: selectedTags.includes(tag) ? "#3b82f6" : "transparent", color: "white", border: "1px solid white", fontWeight: "bold", fontSize: "0.7rem", height: 28, cursor: "pointer", "&:hover": { bgcolor: selectedTags.includes(tag) ? "#2563eb" : "rgba(255,255,255,0.1)" } }} />
                ))}
              </Box>
            )}

            <ItemsGrid items={filteredItems as any} onSelect={addItem} />

            {/* Show verification input only when backend requests it */}
            {showVerificationPrompt && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                <TextField label="Roli verification" size="small" type="password" value={roliVerification} onChange={(e: ChangeEvent<HTMLInputElement>) => setRoliVerification(e.target.value)} sx={{ width: 360 }} />
                <Button variant="contained" onClick={handleSubmit} disabled={isLoading}>{isLoading ? 'Posting...' : 'Submit'}</Button>
              </Box>
            )}

            <TerminalLogs logs={terminalLogs} />

            {/* InventoryPicker modal removed; inventory is auto-loaded and shown in the Offer selector */}

          </CardContent>
        </Card>
      </Box>
    </ThemeProvider>
  );
}

// InventoryPicker modal (rendered below)

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { authData, isLoading } = useAuth();
  if (isLoading) {
    return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#3a4049" }}>
          <Typography variant="h6" sx={{ color: "white" }}>Loading...</Typography>
        </Box>
      </ThemeProvider>
    );
  }

  if (!authData) {
    return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <LoginFlow onLoginComplete={() => {}} />
      </ThemeProvider>
    );
  }

  return <MainApp />;
}


