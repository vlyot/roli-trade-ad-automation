// TerminalLogs.tsx — simple log area showing messages
import { Paper, Typography } from "@mui/material";

export default function TerminalLogs({ logs }: { logs: string[] }) {
  return (
    <Paper sx={{ bgcolor: "#0b1220", color: "#cbd5e1", p: 1, height: 180, overflowY: "auto" }}> 
      {logs.length === 0 ? (
        <Typography variant="caption" sx={{ color: "#94a3b8" }}>No logs yet</Typography>
      ) : (
        logs.map((l, i) => (
          <Typography key={i} variant="caption" sx={{ display: "block", whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "0.72rem", mb: 0.25 }}>{l}</Typography>
        ))
      )}
    </Paper>
  );
}
