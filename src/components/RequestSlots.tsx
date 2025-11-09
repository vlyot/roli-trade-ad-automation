// RequestSlots.tsx — renders the 4 request slots which can contain either an item or a tag chip

import { Box, IconButton, Chip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

export interface RequestSlotsProps {
  requestItems: number[];
  selectedTags: string[];
  onRemoveItem: (index: number) => void;
  onRemoveTag: (tag: string) => void;
  // optional map of catalog id -> metadata (name, thumbnail, rap, value)
  catalogMap?: Map<number, any>;
}

export default function RequestSlots({ requestItems, selectedTags, onRemoveItem, onRemoveTag, catalogMap }: RequestSlotsProps) {
  return (
    <Box sx={{ display: "flex", gap: 1, mb: 1, justifyContent: "center" }}>
      {Array.from({ length: 4 }).map((_, idx) => {
        const item = requestItems[idx];
        const tag = idx >= requestItems.length ? selectedTags[idx - requestItems.length] : null;
        return (
          <Box key={idx} sx={{ width: 100, bgcolor: "#4a525c", borderRadius: 1, height: 100, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", border: "1px solid #5a626c" }}>
            {item && (
              <IconButton size="small" onClick={() => onRemoveItem(idx)} sx={{ position: "absolute", top: 2, right: 2, bgcolor: "rgba(0,0,0,0.6)", color: "white", "&:hover": { bgcolor: "rgba(0,0,0,0.8)" }, width: 18, height: 18, p: 0 }}>
                <CloseIcon sx={{ fontSize: 12 }} />
              </IconButton>
            )}
            {item ? (
              (() => {
                const meta = catalogMap?.get(item);
                const thumb = meta?.thumbnail ?? null;
                if (thumb) {
                  return <Box component="img" src={thumb} alt={meta?.name ?? "item"} sx={{ width: 70, height: 70, objectFit: "contain", bgcolor: "#222", borderRadius: 0.5 }} />;
                }
                return <Box sx={{ width: 70, height: 70, bgcolor: "#5a626c", borderRadius: 1 }} />;
              })()
            ) : tag ? <Chip label={tag.toUpperCase()} onDelete={() => onRemoveTag(tag)} sx={{ bgcolor: "#3b82f6", color: "white", fontWeight: "bold", fontSize: "0.7rem", height: 24 }} deleteIcon={<CloseIcon sx={{ fontSize: 14, color: "white !important" }} />} /> : null}
          </Box>
        );
      })}
    </Box>
  );
}
