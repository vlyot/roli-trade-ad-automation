// PlayerAndCookieInputs.tsx — inputs for player id and roli_verification cookie
import { Box, Button, TextField } from "@mui/material";

export default function PlayerAndCookieInputs({ playerId, setPlayerId, roliVerification, setRoliVerification, onPost }: { playerId: string; setPlayerId: (s: string) => void; roliVerification: string; setRoliVerification: (s: string) => void; onPost: () => void; }) {
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
      <TextField label="Player ID" size="small" value={playerId} onChange={(e) => setPlayerId(e.target.value)} sx={{ width: 180 }} />
      <TextField label="Roli verification" size="small" type="password" value={roliVerification} onChange={(e) => setRoliVerification(e.target.value)} sx={{ width: 240 }} />
      <Button variant="contained" onClick={onPost}>Post Trade Ad</Button>
    </Box>
  );
}
