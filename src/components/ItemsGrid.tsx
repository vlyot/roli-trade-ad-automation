// ItemsGrid.tsx — grid wrapper and ItemCard for each item
import { Box, Card, CardContent, Typography } from "@mui/material";

export interface Item {
  id: number;
  name: string;
  abbreviation?: string | null;
  rap: number;
  value: number;
  thumbnail?: string | null;
}

export interface ItemsGridProps {
  items: Item[];
  onSelect: (id: number) => void;
}

function ItemCard({ item, onClick }: { item: Item; onClick: (id: number) => void }) {
  return (
    <Card onClick={() => onClick(item.id)} sx={{ bgcolor: "#2d2d30", cursor: "pointer", "&:hover": { bgcolor: "#3d3d40", transform: "translateY(-2px)" }, transition: "all 0.2s" }}>
      <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 } }}>
        <Typography variant="caption" sx={{ color: "white", fontWeight: "bold", display: "block", mb: 0.5, fontSize: "0.65rem", lineHeight: 1.1, minHeight: 22, overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</Typography>
        {item.thumbnail ? (
          <Box component="img" src={item.thumbnail} alt={item.name} sx={{ width: "100%", height: 70, objectFit: "contain", bgcolor: "#222", borderRadius: 0.5, mb: 0.5 }} />
        ) : (
          <Box sx={{ width: "100%", height: 70, bgcolor: "#4a525c", borderRadius: 0.5, mb: 0.5 }} />
        )}
        <Typography variant="caption" sx={{ color: "#60a5fa", display: "block", fontSize: "0.6rem" }}>RAP: {item.rap.toLocaleString()}</Typography>
        <Typography variant="caption" sx={{ color: "#60a5fa", display: "block", fontSize: "0.6rem" }}>Value: {item.value.toLocaleString()}</Typography>
      </CardContent>
    </Card>
  );
}

export default function ItemsGrid({ items, onSelect }: ItemsGridProps) {
  return (
    <Box sx={{ mb: 2, maxHeight: 280, overflowY: "auto", bgcolor: "#3a4049", borderRadius: 1, p: 0.5 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
        {items.map((item) => (
          <Box key={item.id} sx={{ width: "calc(16.666% - 6px)", minWidth: 110 }}>
            <ItemCard item={item} onClick={onSelect} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
