import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Box, Button, Card, CardContent, Typography, Chip, ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import OfferSlots from "./components/OfferSlots";
import RequestSlots from "./components/RequestSlots";
import SelectorButtons from "./components/SelectorButtons";
import SearchBar from "./components/SearchBar";
import ItemsGrid from "./components/ItemsGrid";
import PaginationControls from "./components/PaginationControls";
import PlayerAndCookieInputs from "./components/PlayerAndCookieInputs";
import TerminalLogs from "./components/TerminalLogs";

interface TradeAdRequest {
  player_id: number;
  offer_item_ids: number[];
  request_item_ids: number[];
  request_tags: string[];
  roli_verification: string;
}

const AVAILABLE_TAGS = ["any", "demand", "rares", "rap", "robux", "upgrade", "downgrade", "wishlist", "projecteds", "adds"];

const INVENTORY_ITEMS = [
  { id: 564449640, name: "Radioactive Beast Mo...", rap: 57713, value: 60000 },
  { id: 1234567, name: "Golden Crown", rap: 17088, value: 20000 },
  { id: 1234568, name: "Blue Top Hat with Wh...", rap: 8092, value: 9000 },
  { id: 1234569, name: "Guardian Angel Wings", rap: 1981, value: 2000 },
  { id: 1234570, name: "Kuddle E. Koala", rap: 943, value: 1000 },
  { id: 1234571, name: "Katana Traveling Pack", rap: 497, value: 500 },
];

const darkTheme = createTheme({ palette: { mode: "dark", primary: { main: "#3b82f6" }, background: { default: "#3a4049", paper: "#3a4049" } } });

export default function App() {
  const [playerId, setPlayerId] = useState("");
  const [roliVerification, setRoliVerification] = useState("");
  const [offerItems, setOfferItems] = useState<number[]>([]);
  const [requestItems, setRequestItems] = useState<number[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [catalogItems, setCatalogItems] = useState<Array<{ id: number; name: string; abbreviation?: string | null; rap: number; value: number }>>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const PER_PAGE = 30;
  // full-catalog cache per search term to enable instant client-side pagination
  // key: searchValue ('' for no search) -> { items: rawItems[], total }
  const catalogFullCache = (globalThis as any)._catalogFullCacheRef || { current: new Map<string, { items: any[]; total: number }>() };
  (globalThis as any)._catalogFullCacheRef = catalogFullCache;

  const [isLoading, setIsLoading] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [selectorMode, setSelectorMode] = useState<"offer" | "request">("offer");
  const [searchValue, setSearchValue] = useState("");

  const appendLog = (line: string) => setTerminalLogs((prev) => [...prev, line].slice(-200));

  const currentItems = selectorMode === "offer" ? INVENTORY_ITEMS : catalogItems;
  const filteredItems = currentItems.filter((item) => item.name.toLowerCase().includes(searchValue.toLowerCase()) || ((item as any).abbreviation || "").toLowerCase().includes(searchValue.toLowerCase()));

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

  const offerValue = offerItems.reduce((sum, id) => sum + (INVENTORY_ITEMS.find((i) => i.id === id)?.value || 0), 0);
  const offerRAP = offerItems.reduce((sum, id) => sum + (INVENTORY_ITEMS.find((i) => i.id === id)?.rap || 0), 0);

  const requestValue = requestItems.reduce((sum, id) => {
    const inv = INVENTORY_ITEMS.find((i) => i.id === id);
    if (inv) return sum + inv.value;
    const cat = catalogItems.find((i) => i.id === id);
    return sum + (cat ? cat.value : 0);
  }, 0);
  const requestRAP = requestItems.reduce((sum, id) => {
    const inv = INVENTORY_ITEMS.find((i) => i.id === id);
    if (inv) return sum + inv.rap;
    const cat = catalogItems.find((i) => i.id === id);
    return sum + (cat ? cat.rap : 0);
  }, 0);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length + requestItems.length >= 4 ? prev : [...prev, tag]));
  };

  const addItem = (itemId: number) => {
    if (selectorMode === "offer") {
      setOfferItems((prev) => (prev.length >= 4 || prev.includes(itemId) ? prev : [...prev, itemId]));
    } else {
      setRequestItems((prev) => (prev.length + selectedTags.length >= 4 || prev.includes(itemId) ? prev : [...prev, itemId]));
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

      const request: TradeAdRequest = { player_id: playerIdNum, offer_item_ids: offerItems, request_item_ids: requestItems, request_tags: selectedTags, roli_verification: roliVerification.trim() };
      appendLog("Posting trade ad...");
      if (typeof invoke !== "function") {
        appendLog("Tauri invoke() unavailable — cannot post");
        setIsLoading(false);
        return;
      }
      const response = await invoke<any>("post_trade_ad", { request });
      if (response && Array.isArray(response.logs)) setTerminalLogs(response.logs);
      else if (response && response.logs) setTerminalLogs(Array.isArray(response.logs) ? response.logs : [String(response.logs)]);
      else appendLog("Success!");
    } catch (err: any) {
      setTerminalLogs([err?.message ?? String(err)]);
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

            <Box sx={{ mb: 1 }}>
              <Typography variant="h6" sx={{ textAlign: "center", mb: 1, color: "white", fontSize: "1.1rem" }}>Offer</Typography>
              <OfferSlots offerItems={offerItems} onRemove={(idx) => setOfferItems((s) => s.filter((_, i) => i !== idx))} />
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="body2" sx={{ color: "#60a5fa", fontSize: "0.85rem" }}>Value {offerValue.toLocaleString()}</Typography>
                <Typography variant="body2" sx={{ color: "#60a5fa", fontSize: "0.85rem" }}>RAP {offerRAP.toLocaleString()}</Typography>
              </Box>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" sx={{ textAlign: "center", mb: 1, color: "white", fontSize: "1.1rem" }}>Request</Typography>
              <RequestSlots requestItems={requestItems} selectedTags={selectedTags} onRemoveItem={(idx) => setRequestItems((s) => s.filter((_, i) => i !== idx))} onRemoveTag={(tag) => setSelectedTags((s) => s.filter((t) => t !== tag))} />
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

          </CardContent>
        </Card>
      </Box>
    </ThemeProvider>
  );
}

