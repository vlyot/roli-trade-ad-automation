// TradeAdSelector.tsx
// Dynamic selector for offer/request (search bar, tags)
import React from "react";

interface TradeAdSelectorProps {
  mode: 'offer' | 'request';
  selectedTags: string[];
  toggleTag: (tag: string) => void;
  searchValue: string;
  setSearchValue: (val: string) => void;
}

const AVAILABLE_TAGS = [
  "any",
  "demand",
  "rares",
  "robux",
  "upgrade",
  "downgrade",
  "rap",
  "wishlist",
  "projecteds",
  "adds",
];

export function TradeAdSelector({ mode, selectedTags, toggleTag, searchValue, setSearchValue }: TradeAdSelectorProps) {
  return (
  <div className="w-full flex flex-col items-center py-[1vw] px-[1vw] md:py-2 md:px-2" style={{maxHeight: '18vh', overflowY: 'auto'}}>
      {mode === "offer" ? (
        <>
          <div className="w-full">
            <input
              type="text"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              placeholder="Search your inventory"
              className="w-full max-w-[98vw] px-[1vw] py-[0.5vw] rounded bg-[#181A20] text-white placeholder-gray-400 border border-gray-700 mb-[0.5vw] text-[1vw] md:text-base"
              style={{ fontSize: "1vw" }}
            />
            {/* Inventory grid placeholder */}
            <div className="w-full flex flex-wrap gap-[0.5vw] md:gap-2 justify-start">
              {["Radioactive Beast", "Golden Crown", "Blue Top Hat", "Guardian Angel Wings", "Kuddle E. Koala", "Katana Traveling Pack"].map((name, idx) => (
                <div key={idx} className="bg-[#222] rounded shadow p-[0.5vw] md:p-2 min-w-[60px] w-[18vw] max-w-[120px] flex flex-col items-center">
                  <div className="w-[7vw] h-[7vw] max-w-[48px] max-h-[48px] bg-gray-700 rounded mb-[0.5vw] md:mb-2" />
                  <div className="text-[1vw] md:text-xs text-white font-bold mb-[0.5vw]">{name}</div>
                  <div className="text-[1vw] md:text-xs text-blue-400 mb-[0.5vw]">RAP: {Math.floor(Math.random()*60000)}</div>
                  <div className="text-[1vw] md:text-xs text-green-400">Value: {Math.floor(Math.random()*60000)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 md:gap-2 justify-center mb-1 md:mb-2">
            {AVAILABLE_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`min-w-[60px] w-[10vw] max-w-[120px] px-[1vw] py-[0.5vw] rounded-full text-[1vw] md:text-lg font-bold border-2 transition-all ${
                  selectedTags.includes(tag)
                    ? "bg-blue-600 text-white border-blue-400 shadow-lg"
                    : "bg-[#181A20] text-gray-400 border-gray-700 hover:bg-gray-700"
                }`}
                style={{marginBottom: '0.5vw'}}>
                {tag.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="w-full">
            <input
              type="text"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              placeholder="Search the catalog"
              className="w-full max-w-[98vw] px-[1vw] py-[0.5vw] rounded bg-[#181A20] text-white placeholder-gray-400 border border-gray-700 mb-[0.5vw] text-[1vw] md:text-base"
              style={{ fontSize: "1vw" }}
            />
            {/* Catalog grid placeholder */}
            <div className="w-full flex flex-wrap gap-[0.5vw] md:gap-2 justify-start">
              {["Dominus Empyreus", "Dominus Frigidus", "Dominus Crown", "Dominus Astra", "Red Sparkle Time", "Rainbow Shaggy", "Black Sparkle Time"].map((name, idx) => (
                <div key={idx} className="bg-[#222] rounded shadow p-[0.5vw] md:p-2 min-w-[60px] w-[18vw] max-w-[120px] flex flex-col items-center">
                  <div className="w-[7vw] h-[7vw] max-w-[48px] max-h-[48px] bg-gray-700 rounded mb-[0.5vw] md:mb-2" />
                  <div className="text-[1vw] md:text-xs text-white font-bold mb-[0.5vw]">{name}</div>
                  <div className="text-[1vw] md:text-xs text-blue-400 mb-[0.5vw]">RAP: {Math.floor(Math.random()*10000000)}</div>
                  <div className="text-[1vw] md:text-xs text-green-400">Value: {Math.floor(Math.random()*10000000)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
