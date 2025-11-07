import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Box, Button, Card, CardContent, TextField, Typography, IconButton, InputAdornment, Chip, ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

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

function App() {
  const [playerId, setPlayerId] = useState("");
  const [roliVerification, setRoliVerification] = useState("");
  const [offerItems, setOfferItems] = useState<number[]>([]);
  const [requestItems, setRequestItems] = useState<number[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // Catalog (Rolimons) fetched items for request selection
  const [catalogItems, setCatalogItems] = useState<Array<{id:number,name:string,abbreviation?:string|null,rap:number,value:number}>>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const PER_PAGE = 30;
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Append a line to the terminal/log output (keeps most recent at bottom)
  const appendLog = (line: string) => {
    setTerminalLogs((prev) => {
      const next = [...prev, line];
      // keep last 200 lines
      return next.slice(-200);
    });
  };
  const [isLoading, setIsLoading] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [selectorMode, setSelectorMode] = useState<"offer" | "request">("offer");
  const [searchValue, setSearchValue] = useState("");

  const currentItems = selectorMode === "offer" ? INVENTORY_ITEMS : catalogItems;
  const filteredItems = currentItems.filter(item => item.name.toLowerCase().includes(searchValue.toLowerCase()) || ((item as any).abbreviation || "").toLowerCase().includes(searchValue.toLowerCase()));

  // Fetch catalog when in request selector mode, or when page/search changes
  useEffect(() => {
    let active = true;
    const fetchPage = async () => {
      if (selectorMode !== "request") return;
      setCatalogLoading(true);
      appendLog(`Loading catalog page ${catalogPage}...`);
      try {
        if (typeof invoke !== "function") {
          appendLog("Tauri invoke() is not available in this environment.");
          setCatalogItems([]);
          setCatalogTotal(0);
          setCatalogLoading(false);
          return;
        }

  const res: any = await invoke("get_catalog_items", { page: catalogPage, perPage: PER_PAGE, search: searchValue || null });
        if (!active) return;
        if (res && res.items) {
          const mapped = res.items.map((it: any) => ({ id: it.id, name: it.name, abbreviation: it.abbreviation ?? null, rap: it.rap, value: it.value }));
          setCatalogItems(mapped);
          setCatalogTotal(res.total || 0);
          appendLog(`Loaded ${mapped.length} items (total ${res.total || 0})`);
        } else {
          setCatalogItems([]);
          setCatalogTotal(0);
          appendLog("No items returned from catalog API");
        }
      } catch (e: any) {
        console.error("Failed to fetch catalog:", e);
        setCatalogItems([]);
        setCatalogTotal(0);
        appendLog(`Failed to load catalog: ${e?.toString() ?? String(e)}`);
      } finally {
        if (active) setCatalogLoading(false);
      }
    };
    fetchPage();
    return () => { active = false; };
  }, [selectorMode, catalogPage, searchValue]);

  const offerValue = offerItems.reduce((sum, id) => sum + (INVENTORY_ITEMS.find(i => i.id === id)?.value || 0), 0);
  const offerRAP = offerItems.reduce((sum, id) => sum + (INVENTORY_ITEMS.find(i => i.id === id)?.rap || 0), 0);
  const requestValue = requestItems.reduce((sum, id) => {
    const inv = INVENTORY_ITEMS.find(i => i.id === id);
    if (inv) return sum + inv.value;
    const cat = catalogItems.find(i => i.id === id);
    return sum + (cat ? cat.value : 0);
  }, 0);
  const requestRAP = requestItems.reduce((sum, id) => {
    const inv = INVENTORY_ITEMS.find(i => i.id === id);
    if (inv) return sum + inv.rap;
    const cat = catalogItems.find(i => i.id === id);
    return sum + (cat ? cat.rap : 0);
  }, 0);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      if (selectedTags.length + requestItems.length >= 4) return;
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const addItem = (itemId: number) => {
    if (selectorMode === "offer") {
      if (offerItems.length >= 4 || offerItems.includes(itemId)) return;
      setOfferItems([...offerItems, itemId]);
    } else {
      if (requestItems.length + selectedTags.length >= 4 || requestItems.includes(itemId)) return;
      setRequestItems([...requestItems, itemId]);
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setTerminalLogs([]);
    appendLog("Connecting...");
    try {
      const playerIdNum = parseInt(playerId);
      if (isNaN(playerIdNum) || playerIdNum <= 0) throw new Error("Please enter a valid player ID");
      if (offerItems.length === 0) throw new Error("Please add at least one offer item");
      if (requestItems.length + selectedTags.length === 0) throw new Error("Please add at least one request item or tag");
      if (!roliVerification.trim()) throw new Error("Please enter your Roli Verification cookie");

      const request: TradeAdRequest = { player_id: playerIdNum, offer_item_ids: offerItems, request_item_ids: requestItems, request_tags: selectedTags, roli_verification: roliVerification.trim() };
      appendLog("Posting trade ad...");
      if (typeof invoke !== "function") {
        appendLog("Tauri invoke() is not available in this environment. Cannot post trade ad.");
        setIsLoading(false);
        return;
      }
      const response = await invoke<any>("post_trade_ad", { request });
      if (response && Array.isArray(response.logs)) {
        setTerminalLogs(response.logs);
      } else if (response && response.logs) {
        setTerminalLogs(Array.isArray(response.logs) ? response.logs : [String(response.logs)]);
      } else {
        appendLog("Success!");
      }
    } catch (error) {
      setTerminalLogs([error instanceof Error ? error.message : "An unknown error occurred"]);
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
            {/* Offer */}
            <Box sx={{ mb: 1 }}>
              <Typography variant="h6" sx={{ textAlign: "center", mb: 1, color: "white", fontSize: "1.1rem" }}>Offer</Typography>
              <Box sx={{ display: "flex", gap: 1, mb: 1, justifyContent: "center" }}>
                {Array.from({ length: 4 }).map((_, idx) => (
                  <Box key={idx} sx={{ width: 100, bgcolor: "#4a525c", borderRadius: 1, height: 100, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", border: "1px solid #5a626c" }}>
                    {offerItems[idx] && <IconButton size="small" onClick={() => setOfferItems(offerItems.filter((_, i) => i !== idx))} sx={{ position: "absolute", top: 2, right: 2, bgcolor: "rgba(0,0,0,0.6)", color: "white", "&:hover": { bgcolor: "rgba(0,0,0,0.8)" }, width: 18, height: 18, p: 0 }}><CloseIcon sx={{ fontSize: 12 }} /></IconButton>}
                    {offerItems[idx] && <Box sx={{ width: 70, height: 70, bgcolor: "#5a626c", borderRadius: 1 }} />}
                  </Box>
                ))}
              </Box>
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="body2" sx={{ color: "#60a5fa", fontSize: "0.85rem" }}>Value {offerValue.toLocaleString()}</Typography>
                <Typography variant="body2" sx={{ color: "#60a5fa", fontSize: "0.85rem" }}>RAP {offerRAP.toLocaleString()}</Typography>
              </Box>
            </Box>
            {/* Request */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" sx={{ textAlign: "center", mb: 1, color: "white", fontSize: "1.1rem" }}>Request</Typography>
              <Box sx={{ display: "flex", gap: 1, mb: 1, justifyContent: "center" }}>
                {Array.from({ length: 4 }).map((_, idx) => {
                  const item = requestItems[idx];
                  const tag = idx >= requestItems.length ? selectedTags[idx - requestItems.length] : null;
                  return (
                    <Box key={idx} sx={{ width: 100, bgcolor: "#4a525c", borderRadius: 1, height: 100, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", border: "1px solid #5a626c" }}>
                      {item && <IconButton size="small" onClick={() => setRequestItems(requestItems.filter((_, i) => i !== idx))} sx={{ position: "absolute", top: 2, right: 2, bgcolor: "rgba(0,0,0,0.6)", color: "white", "&:hover": { bgcolor: "rgba(0,0,0,0.8)" }, width: 18, height: 18, p: 0 }}><CloseIcon sx={{ fontSize: 12 }} /></IconButton>}
                      {item ? <Box sx={{ width: 70, height: 70, bgcolor: "#5a626c", borderRadius: 1 }} /> : tag ? <Chip label={tag.toUpperCase()} onDelete={() => setSelectedTags(selectedTags.filter(t => t !== tag))} sx={{ bgcolor: "#3b82f6", color: "white", fontWeight: "bold", fontSize: "0.7rem", height: 24 }} deleteIcon={<CloseIcon sx={{ fontSize: 14, color: "white !important" }} />} /> : null}
                    </Box>
                  );
                })}
              </Box>
              <Box sx={{ textAlign: "center", mb: 2 }}>
                <Typography variant="body2" sx={{ color: "#60a5fa", fontSize: "0.85rem" }}>Value {requestValue.toLocaleString()}</Typography>
                <Typography variant="body2" sx={{ color: "#60a5fa", fontSize: "0.85rem" }}>RAP {requestRAP.toLocaleString()}</Typography>
              </Box>
              <Box sx={{ textAlign: "center", mb: 2 }}>
                <Button variant="contained" onClick={handleSubmit} disabled={isLoading} sx={{ bgcolor: "#4a525c", color: "white", px: 4, py: 0.75, textTransform: "none", fontSize: "1rem", "&:hover": { bgcolor: "#5a626c" }, "&:disabled": { bgcolor: "#3a424c", color: "#999" } }}>{isLoading ? "Posting..." : "Submit"}</Button>
              </Box>
            </Box>
            {/* Selector Buttons */}
            <Box sx={{ display: "flex", gap: 1, mb: 1.5 }}>
              <Button fullWidth variant={selectorMode === "offer" ? "contained" : "outlined"} onClick={() => setSelectorMode("offer")} sx={{ bgcolor: selectorMode === "offer" ? "#4a525c" : "transparent", color: selectorMode === "offer" ? "white" : "#999", borderColor: "#5a626c", textTransform: "none", fontSize: "0.95rem", py: 0.75, "&:hover": { bgcolor: selectorMode === "offer" ? "#5a626c" : "rgba(255,255,255,0.05)", borderColor: "#6a727c" } }}>Add to Offer</Button>
              <Button fullWidth variant={selectorMode === "request" ? "contained" : "outlined"} onClick={() => { setSelectorMode("request"); setCatalogPage(1); }} sx={{ bgcolor: selectorMode === "request" ? "#4a525c" : "transparent", color: selectorMode === "request" ? "white" : "#999", borderColor: "#5a626c", textTransform: "none", fontSize: "0.95rem", py: 0.75, "&:hover": { bgcolor: selectorMode === "request" ? "#5a626c" : "rgba(255,255,255,0.05)", borderColor: "#6a727c" } }}>Add to Request</Button>
            </Box>
            {/* Search */}
            <TextField fullWidth variant="outlined" placeholder={selectorMode === "offer" ? "Search your inventory" : "Search the catalog"} value={searchValue} onChange={(e) => setSearchValue(e.target.value)} InputProps={{ endAdornment: searchValue && (<InputAdornment position="end"><IconButton onClick={() => setSearchValue("")} edge="end" size="small"><CloseIcon sx={{ fontSize: 18 }} /></IconButton></InputAdornment>), sx: { bgcolor: "#e5e7eb", color: "#1e1e1e", fontSize: "0.9rem", "& fieldset": { border: "none" } } }} sx={{ mb: 1.5 }} />
            {/* Items Grid */}
            {selectorMode === "request" && (
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 1 }}>
                {(() => {
                  const totalPages = Math.max(1, Math.ceil(catalogTotal / PER_PAGE));
                  const pagesToShow = Math.min(totalPages, 20);
                  const arr = [] as number[];
                  for (let i = 1; i <= pagesToShow; i++) arr.push(i);
                  return arr.map((p) => (
                    <Button key={p} size="small" onClick={() => setCatalogPage(p)} variant={p === catalogPage ? "contained" : "outlined"} sx={{ minWidth: 32, px: 1, py: 0.25, textTransform: 'none' }}>{p}</Button>
                  ));
                })()}
              </Box>
            )}

            <Box sx={{ mb: 2, maxHeight: 280, overflowY: "auto", bgcolor: "#3a4049", borderRadius: 1, p: 0.5 }}>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                {filteredItems.map((item) => (
                  <Box key={item.id} sx={{ width: "calc(16.666% - 6px)", minWidth: 110 }}>
                    <Card onClick={() => addItem(item.id)} sx={{ bgcolor: "#2d2d30", cursor: "pointer", "&:hover": { bgcolor: "#3d3d40", transform: "translateY(-2px)" }, transition: "all 0.2s" }}>
                      <CardContent sx={{ p: 0.75, "&:last-child": { pb: 0.75 } }}>
                        <Typography variant="caption" sx={{ color: "white", fontWeight: "bold", display: "block", mb: 0.5, fontSize: "0.65rem", lineHeight: 1.1, minHeight: 22, overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</Typography>
                        <Box sx={{ width: "100%", height: 70, bgcolor: "#4a525c", borderRadius: 0.5, mb: 0.5 }} />
                        <Typography variant="caption" sx={{ color: "#60a5fa", display: "block", fontSize: "0.6rem" }}>RAP: {item.rap.toLocaleString()}</Typography>
                        <Typography variant="caption" sx={{ color: "#60a5fa", display: "block", fontSize: "0.6rem" }}>Value: {item.value.toLocaleString()}</Typography>
                      </CardContent>
                    </Card>
                  </Box>
                ))}
              </Box>
            </Box>
            {/* Tags */}
            {selectorMode === "request" && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, justifyContent: "center", mb: 2 }}>
                {AVAILABLE_TAGS.map((tag) => (
                  <Chip key={tag} label={tag.toUpperCase()} onClick={() => toggleTag(tag)} sx={{ bgcolor: selectedTags.includes(tag) ? "#3b82f6" : "transparent", color: "white", border: "1px solid white", fontWeight: "bold", fontSize: "0.7rem", height: 28, cursor: "pointer", "&:hover": { bgcolor: selectedTags.includes(tag) ? "#2563eb" : "rgba(255,255,255,0.1)" } }} />
                ))}
              </Box>
            )}
            {/* Player ID */}
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Enter your Roblox Player ID"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              InputProps={{
                sx: {
                  bgcolor: "#4a525c",
                  color: "white",
                  fontSize: "0.9rem",
                  '& fieldset': { border: 'none' },
                  '& input::placeholder': { color: '#999', opacity: 1 },
                }
              }}
              sx={{ mb: 1 }}
            />
            {/* Roli Verification */}
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Enter your Roli Verification cookie (_RoliVerification)"
              value={roliVerification}
              onChange={(e) => setRoliVerification(e.target.value)}
              InputProps={{
                sx: {
                  bgcolor: "#4a525c",
                  color: "white",
                  fontSize: "0.9rem",
                  '& fieldset': { border: 'none' },
                  '& input::placeholder': { color: '#999', opacity: 1 },
                }
              }}
              sx={{ mb: 1 }}
              type="password"
            />
            {/* Terminal */}
            {terminalLogs.length > 0 && (
              <Box sx={{ bgcolor: "black", color: "#4ade80", p: 1, borderRadius: 1, fontFamily: "monospace", fontSize: "0.7rem", maxHeight: 60, overflowY: "auto" }}>
                {terminalLogs.map((line, idx) => (<div key={idx}>{line}</div>))}
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </ThemeProvider>
  );
}

export default App;
