// SelectorButtons.tsx — toggle between offer and request selector modes
import { Box, Button } from "@mui/material";

export interface SelectorButtonsProps {
  mode: "offer" | "request";
  onChange: (mode: "offer" | "request") => void;
}

export default function SelectorButtons({ mode, onChange }: SelectorButtonsProps) {
  return (
    <Box sx={{ display: "flex", gap: 1, mb: 1.5 }}>
      <Button fullWidth variant={mode === "offer" ? "contained" : "outlined"} onClick={() => onChange("offer")} sx={{ bgcolor: mode === "offer" ? "#4a525c" : "transparent", color: mode === "offer" ? "white" : "#999", borderColor: "#5a626c", textTransform: "none", fontSize: "0.95rem", py: 0.75, "&:hover": { bgcolor: mode === "offer" ? "#5a626c" : "rgba(255,255,255,0.05)", borderColor: "#6a727c" } }}>Add to Offer</Button>
      <Button fullWidth variant={mode === "request" ? "contained" : "outlined"} onClick={() => onChange("request")} sx={{ bgcolor: mode === "request" ? "#4a525c" : "transparent", color: mode === "request" ? "white" : "#999", borderColor: "#5a626c", textTransform: "none", fontSize: "0.95rem", py: 0.75, "&:hover": { bgcolor: mode === "request" ? "#5a626c" : "rgba(255,255,255,0.05)", borderColor: "#6a727c" } }}>Add to Request</Button>
    </Box>
  );
}
