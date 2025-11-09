import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Box, Button, Card, CardContent, Typography, Chip, ThemeProvider, createTheme, CssBaseline, IconButton, CircularProgress } from "@mui/material";
import { Logout as LogoutIcon } from "@mui/icons-material";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginFlow from "./components/LoginFlow";
import OfferSlots from "./components/OfferSlots";
import RequestSlots from "./components/RequestSlots";
import SelectorButtons from "./components/SelectorButtons";
import SearchBar from "./components/SearchBar";
import ItemsGrid from "./components/ItemsGrid";
import PaginationControls from "./components/PaginationControls";
import PlayerAndCookieInputs from "./components/PlayerAndCookieInputs";
import TerminalLogs from "./components/TerminalLogs";
// InventoryPicker removed: inventory will load automatically and be enriched from catalog data

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
  const [selectorMode, setSelectorMode] = useState<"offer" | "request">("offer");
  const [searchValue, setSearchValue] = useState("");

  const appendLog = (line: string) => setTerminalLogs((prev) => [...prev, line].slice(-200));

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

        // Invoke once and request a very large per_page so backend returns all items at once
        // The backend fetch_item_details reads all items from Rolimons and then slices by page/per_page,
        // so asking for a huge per_page returns the full list in one call.
        const bigPerPage = 10_000_000;
        const resAll: any = await invoke("get_catalog_items", { page: 1, perPage: bigPerPage, search: searchValue || null });
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
        appendLog(`Failed to fetch catalog: ${err?.toString() ?? String(err)}`);
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
      const res: any = await invoke("fetch_player_inventory", { playerId: pid });
      const itemsArr: any[] = (res && Array.isArray(res.items)) ? res.items : [];
      if (itemsArr.length === 0) {
        appendLog("No inventory returned");
        setInventoryItems([]);
        setIsEnriching(false);
        return;
      }

      // Normalize to objects with instance id and catalog id (catalog_id may be string key)
      const mapped = itemsArr.map((it: any) => ({ id: it.instance_id ?? it.id ?? null, catalog_id: it.catalog_id ?? it.catalogId ?? it.catalog ?? null, held: !!it.held }));

      // Build a catalog lookup from any cached full-catalog entries and current catalogItems
      const catalogMap = new Map<number, any>();
      for (const entry of catalogFullCache.current.values()) {
        for (const ci of entry.items) catalogMap.set(ci.id, ci);
      }
      for (const ci of catalogItems) catalogMap.set(ci.id, ci);

      // Collect missing catalog ids
      const missingSet = new Set<number>();
      for (const m of mapped) {
        const cid = Number(m.catalog_id);
        if (cid && !catalogMap.has(cid)) missingSet.add(cid);
      }

      if (missingSet.size > 0) {
        const missingIds = Array.from(missingSet);
        appendLog(`Enriching inventory: fetching ${missingIds.length} missing catalog items...`);
        try {
          const resIds: any = await invoke("get_catalog_items_by_ids", { ids: missingIds });
          if (resIds && Array.isArray(resIds.items)) {
            for (const it of resIds.items) catalogMap.set(it.id, it);
            // Also merge into full cache under empty key for future lookups
            const existing = catalogFullCache.current.get("")?.items ?? [];
            catalogFullCache.current.set("", { items: [...existing, ...(resIds.items || [])], total: (existing.length + (resIds.items || []).length) });
            appendLog(`Enriched with ${resIds.items.length} items`);
          }
        } catch (e: any) {
          appendLog(`Failed targeted catalog fetch: ${String(e)}`);
        }
      }

      const enriched = mapped.map((m: any) => {
        const cid = Number(m.catalog_id);
        const meta = catalogMap.get(cid);
        return {
          id: m.id,
          catalog_id: cid,
          held: m.held,
          name: meta?.name ?? null,
          abbreviation: meta?.abbreviation ?? null,
          rap: meta?.rap ?? 0,
          value: meta?.value ?? 0,
          thumbnail: meta?.thumbnail ?? null,
        };
      });
      setInventoryItems(enriched.filter((e: any) => e.id != null));
      appendLog(`Inventory loaded: ${enriched.length} items`);
    } catch (err: any) {
      appendLog(`Failed to load inventory: ${String(err)}`);
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
        const bigPerPage = 10_000_000;
        const resAll: any = await invoke("get_catalog_items", { page: 1, perPage: bigPerPage, search: null });
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
        appendLog(`Prefetch failed: ${String(e)}`);
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

  const handleSubmit = async () => {
    setIsLoading(true);
    setTerminalLogs([]);
    appendLog("Connecting...");
    try {
      const playerIdNum = parseInt(playerId || "0");
      if (isNaN(playerIdNum) || playerIdNum <= 0) throw new Error("Please enter a valid player ID");
      if (offerItems.length === 0) throw new Error("Please add at least one offer item");
      if (requestItems.length + selectedTags.length === 0) throw new Error("Please add at least one request item or tag");
      if (!roliVerification.trim()) throw new Error("Please enter your Roli Verification cookie");

      // Map offer instance IDs (inventory instance ids) to their catalog/item ids expected by the backend
      const offer_item_ids_mapped: number[] = offerItems
        .map((instId) => {
          const inv = inventoryItems.find((i) => i.id === instId);
          // inventory entries include `catalog_id`; fall back to the instance id if not found
          return inv ? Number(inv.catalog_id ?? inv.catalogId ?? inv.catalog_id) : instId;
        })
        .filter((id) => !!id);

      appendLog(`Mapped ${offerItems.length} offer instances -> ${offer_item_ids_mapped.length} catalog ids`);

      const request: TradeAdRequest = {
        player_id: playerIdNum,
        offer_item_ids: offer_item_ids_mapped,
        request_item_ids: requestItems,
        request_tags: selectedTags.map((t) => t.toLowerCase()),
        roli_verification: roliVerification.trim(),
      };
      appendLog("Posting trade ad...");
      if (typeof invoke !== "function") {
        appendLog("Tauri invoke() unavailable — cannot post");
        setIsLoading(false);
        return;
      }
      const response = await invoke<any>("post_trade_ad", { request });
      
      // Save roli_verification on successful post (or if error is NOT about invalid token)
      if (response && response.success && authData && roliVerification.trim() !== authData.roli_verification) {
        try {
          await updateRoliVerification(roliVerification.trim());
          appendLog("Roli verification saved for future use");
        } catch (e) {
          appendLog(`Warning: Could not save roli_verification: ${e}`);
        }
      }
      
      if (response && Array.isArray(response.logs)) setTerminalLogs(response.logs);
      else if (response && response.logs) setTerminalLogs(Array.isArray(response.logs) ? response.logs : [String(response.logs)]);
      else appendLog("Success!");
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      setTerminalLogs([errMsg]);
      // If error message suggests invalid roli_verification, prompt user to re-enter
      if (errMsg.toLowerCase().includes("roli") && errMsg.toLowerCase().includes("verification")) {
        setRoliVerification("");
        appendLog("Please enter a valid Roli Verification cookie");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: "100vh", bgcolor: "#3a4049", p: 2 }}>
        <Card sx={{ maxWidth: 1000, mx: "auto", bgcolor: "#3a4049", boxShadow: "none" }}>
          <CardContent sx={{ p: 2 }}>

            {/* Welcome message and logout */}
            {authData && (
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, p: 1.5, bgcolor: "#4a525c", borderRadius: 1 }}>
                <Typography variant="subtitle1" sx={{ color: "white", fontWeight: 500 }}>
                  Welcome, {authData.display_name}
                </Typography>
                <IconButton onClick={authLogout} size="small" sx={{ color: "white" }} title="Logout">
                  <LogoutIcon />
                </IconButton>
              </Box>
            )}

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
              <Box sx={{ textAlign: "center", mb: 2 }}>
                <Button variant="contained" onClick={handleSubmit} disabled={isLoading} sx={{ bgcolor: "#4a525c", color: "white", px: 4, py: 0.75, textTransform: "none", fontSize: "1rem", "&:hover": { bgcolor: "#5a626c" }, "&:disabled": { bgcolor: "#3a424c", color: "#999" } }}>{isLoading ? "Posting..." : "Submit"}</Button>
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

            <ItemsGrid items={filteredItems as any} onSelect={addItem} />

            {selectorMode === "request" && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, justifyContent: "center", mb: 2 }}>
                {AVAILABLE_TAGS.map((tag) => (
                  <Chip key={tag} label={tag.toUpperCase()} onClick={() => toggleTag(tag)} sx={{ bgcolor: selectedTags.includes(tag) ? "#3b82f6" : "transparent", color: "white", border: "1px solid white", fontWeight: "bold", fontSize: "0.7rem", height: 28, cursor: "pointer", "&:hover": { bgcolor: selectedTags.includes(tag) ? "#2563eb" : "rgba(255,255,255,0.1)" } }} />
                ))}
              </Box>
            )}

            <PlayerAndCookieInputs playerId={playerId} setPlayerId={setPlayerId} roliVerification={roliVerification} setRoliVerification={setRoliVerification} onPost={handleSubmit} />

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


