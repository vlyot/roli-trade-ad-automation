// OfferSlots.tsx — renders the 4 offer slots with remove buttons
import { Box, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

export interface OfferSlotsProps {
  offerItems: number[];
  onRemove: (index: number) => void;
}

export default function OfferSlots({ offerItems, onRemove }: OfferSlotsProps) {
  return (
    <Box sx={{ display: "flex", gap: 1, mb: 1, justifyContent: "center" }}>
      {Array.from({ length: 4 }).map((_, idx) => (
        <Box key={idx} sx={{ width: 100, bgcolor: "#4a525c", borderRadius: 1, height: 100, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", border: "1px solid #5a626c" }}>
          {offerItems[idx] && (
            <IconButton size="small" onClick={() => onRemove(idx)} sx={{ position: "absolute", top: 2, right: 2, bgcolor: "rgba(0,0,0,0.6)", color: "white", "&:hover": { bgcolor: "rgba(0,0,0,0.8)" }, width: 18, height: 18, p: 0 }}>
              <CloseIcon sx={{ fontSize: 12 }} />
            </IconButton>
          )}
          {offerItems[idx] && <Box sx={{ width: 70, height: 70, bgcolor: "#5a626c", borderRadius: 1 }} />}
        </Box>
      ))}
    </Box>
  );
}
