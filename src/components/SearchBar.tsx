// SearchBar.tsx — search input with optional debounce. Calls onDebouncedChange when user stops typing.
import { useEffect, useState, useRef } from "react";
import { TextField, InputAdornment, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

export interface SearchBarProps {
  // current debounced value (external state)
  value: string;
  placeholder?: string;
  // called when the user stops typing (debounced). If empty string, treated as cleared.
  onDebouncedChange: (v: string) => void;
  // debounce milliseconds (default 300)
  debounceMs?: number;
  // minimum characters before triggering search (default 2)
  minChars?: number;
}

export default function SearchBar({ value, placeholder, onDebouncedChange, debounceMs = 300, minChars = 2 }: SearchBarProps) {
  const [inputValue, setInputValue] = useState(value ?? "");
  const timer = useRef<number | null>(null);

  // keep internal input in sync if parent clears or sets value externally
  useEffect(() => {
    setInputValue(value ?? "");
  }, [value]);

  useEffect(() => {
    // clear timer on unmount
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const schedule = (val: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (val.length === 0) {
        onDebouncedChange("");
      } else if (val.length >= (minChars ?? 2)) {
        onDebouncedChange(val);
      } else {
        // do nothing for short inputs (1 char)
      }
    }, debounceMs);
  };

  return (
    <TextField
      fullWidth
      variant="outlined"
      placeholder={placeholder}
      value={inputValue}
      onChange={(e) => {
        const v = e.target.value;
        setInputValue(v);
        schedule(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          // immediate trigger on Enter regardless of length
          if (timer.current) window.clearTimeout(timer.current);
          if (inputValue.length === 0) onDebouncedChange("");
          else onDebouncedChange(inputValue);
        }
      }}
      InputProps={{
        endAdornment: inputValue && (
          <InputAdornment position="end">
            <IconButton onClick={() => { setInputValue(""); if (timer.current) window.clearTimeout(timer.current); onDebouncedChange(""); }} edge="end" size="small">
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </InputAdornment>
        ),
        sx: { bgcolor: "#e5e7eb", color: "#1e1e1e", fontSize: "0.9rem", '& fieldset': { border: 'none' } }
      }}
      sx={{ mb: 1.5 }}
    />
  );
}
