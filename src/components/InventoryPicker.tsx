// InventoryPicker.tsx
// Component to fetch a player's inventory via Tauri command `fetch_player_inventory` and
// display items (catalog_id, instance_id, held) with value/RAP if available. Allows multi-select
// and returns selected instance IDs via onConfirm.
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Card, CardContent, Typography, Checkbox, CircularProgress, Tooltip } from "@mui/material";
import AccessTimeIcon from '@mui/icons-material/AccessTime';

type InventoryItem = {
  catalog_id: string;
  instance_id: number;
  held: boolean;
  // optional enrichment
  value?: number | null;
  rap?: number | null;
};

type Props = {
  open: boolean;
  playerId?: number | null;
  onClose: () => void;
  onConfirm: (selectedInstanceIds: number[]) => void;
};

export default function InventoryPicker({ open, playerId, onClose, onConfirm }: Props) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    if (!playerId || Number(playerId) <= 0) {
      setItems([]);
      setError("Please enter a valid player id to load inventory.");
      return;
    }

    let active = true;
    const fetchInventory = async () => {
      setLoading(true);
      setError(null);
      try {
        // send both snake_case and camelCase keys to be tolerant of arg mapping
        const res: any = await invoke("fetch_player_inventory", { player_id: playerId, playerId });
        if (!active) return;
        if (!res || !Array.isArray(res.items)) {
          setItems([]);
          setError("No inventory returned.");
        } else {
          const mapped: InventoryItem[] = res.items.map((it: any) => ({ catalog_id: String(it.catalog_id), instance_id: Number(it.instance_id), held: Boolean(it.held), value: it.value ?? null, rap: it.rap ?? null }));
          setItems(mapped);
        }
      } catch (e: any) {
        setError(String(e?.toString?.() ?? e));
        setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchInventory();
    return () => { active = false; };
  }, [open, playerId]);

  const toggleSelect = (instId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(instId)) next.delete(instId);
      else next.add(instId);
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Inventory</DialogTitle>
      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress /></Box>
        )}
        {error && !loading && (
          <Typography color="error">{error}</Typography>
        )}
        {!loading && !error && (
          <Box sx={{ mt: 0.5, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {items.length === 0 && (
              <Typography>No items in inventory.</Typography>
            )}
            {items.map((it) => (
              <Card key={it.instance_id} variant="outlined" sx={{ position: 'relative', bgcolor: selected.has(it.instance_id) ? 'rgba(59,130,246,0.12)' : 'transparent', cursor: 'pointer' }} onClick={() => toggleSelect(it.instance_id)}>
                <CardContent sx={{ p: 1.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{it.catalog_id}</Typography>
                      <Typography variant="caption" sx={{ color: 'gray' }}>Instance: {it.instance_id}</Typography>
                    </Box>
                    <Checkbox checked={selected.has(it.instance_id)} onChange={() => toggleSelect(it.instance_id)} />
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Typography variant="body2">Value: {it.value != null ? it.value.toLocaleString() : '-'}</Typography>
                    <Typography variant="body2">RAP: {it.rap != null ? it.rap.toLocaleString() : '-'}</Typography>
                    {it.held && (
                      <Tooltip title="Held (currently equipped or bound)"><AccessTimeIcon fontSize="small" sx={{ color: '#f59e0b', ml: 0.5 }} /></Tooltip>
                    )}
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" disabled={selected.size === 0}>Add {selected.size} to Offer</Button>
      </DialogActions>
    </Dialog>
  );
}
