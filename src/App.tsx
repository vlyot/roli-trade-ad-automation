import { useState } from "react";
import { TradeAdSelector } from "./components/TradeAdSelector";
import { invoke } from "@tauri-apps/api/core";


interface TradeAdRequest {
  player_id: number;
  offer_item_ids: number[];
  request_item_ids: number[];
  request_tags: string[];
  roli_verification: string;
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

function App() {
  const [playerId, setPlayerId] = useState("");
  const [offerItemIds, setOfferItemIds] = useState<string[]>(["", "", "", ""]);
  const [requestItemIds, setRequestItemIds] = useState<string[]>(["", "", "", ""]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [roliVerification, setRoliVerification] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>(["$ Rolimons Trade Ad Automation Terminal"]);
  // For demo, hardcoded values/RAP
  const offerValue = offerItemIds.some(id => id) ? 1968 : 0;
  // Request slots: up to 4, filled by item IDs first, then tags
  const maxSlots = 4;
  const filledItemIds = requestItemIds.filter(id => id);
  // Only include tags if selected by the user
  const filledTags = selectedTags.length > 0 ? selectedTags : [];
  const requestSlots = [
    ...filledItemIds,
    ...filledTags
  ].slice(0, maxSlots);
  const requestValue = requestSlots.length ? 5894 : 0;

  // Selector state
  const [selectorMode, setSelectorMode] = useState<'offer' | 'request'>('offer');
  const [searchOffer, setSearchOffer] = useState("");
  const [searchRequest, setSearchRequest] = useState("");

  const handleOfferItemChange = (index: number, value: string) => {
    const newOfferItems = [...offerItemIds];
    newOfferItems[index] = value;
    setOfferItemIds(newOfferItems);
  };

  const handleRequestItemChange = (index: number, value: string) => {
    const newRequestItems = [...requestItemIds];
    newRequestItems[index] = value;
    setRequestItemIds(newRequestItems);
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      if (selectedTags.length + requestItemIds.filter((id) => id.trim() !== "").length >= 4) return;
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTerminalLogs(["$ Rolimons Trade Ad Automation Terminal", "Connecting..."]);
    try {
      const playerIdNum = parseInt(playerId);
      if (isNaN(playerIdNum) || playerIdNum <= 0) throw new Error("Please enter a valid player ID");
      const offerIds = offerItemIds.filter((id) => id.trim() !== "").map((id) => {
        const num = parseInt(id);
        if (isNaN(num) || num <= 0) throw new Error(`Invalid offer item ID: ${id}`);
        return num;
      });
      const requestIds = requestItemIds.filter((id) => id.trim() !== "").map((id) => {
        const num = parseInt(id);
        if (isNaN(num) || num <= 0) throw new Error(`Invalid request item ID: ${id}`);
        return num;
      });
      if (offerIds.length === 0) throw new Error("Please enter at least one offer item ID");
      if (offerIds.length > 4) throw new Error("You can only offer up to 4 items");
      if (requestIds.length + selectedTags.length === 0) throw new Error("Please enter at least one request item ID or select a tag");
      if (requestIds.length + selectedTags.length > 4) throw new Error("You can only request up to 4 items (combined item IDs and tags)");
      if (roliVerification.trim() === "") throw new Error("Please enter your Roli Verification cookie");
      const request: TradeAdRequest = {
        player_id: playerIdNum,
        offer_item_ids: offerIds,
        request_item_ids: requestIds,
        request_tags: selectedTags,
        roli_verification: roliVerification.trim(),
      };
      const response = await invoke<any>("post_trade_ad", { request });
      if (response && Array.isArray(response.logs)) {
        setTerminalLogs(["$ Rolimons Trade Ad Automation Terminal", ...response.logs]);
      } else {
        setTerminalLogs(["$ Rolimons Trade Ad Automation Terminal", "Unexpected response from backend."]);
      }
    } catch (error) {
      setTerminalLogs(["$ Rolimons Trade Ad Automation Terminal", error instanceof Error ? error.message : "An unknown error occurred"]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#23272F] flex items-center justify-center" style={{padding: '2vw 2vw'}}>
      <div className="bg-[#23272F] rounded-lg shadow p-2 w-full" style={{maxWidth: '98vw', minWidth: '260px', maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box'}}>
        {/* Header */}
        <div className="py-2 text-center border-b border-gray-800">
          <h1 className="text-[2.5vw] md:text-2xl font-bold text-white mb-1 tracking-tight">Rolimons Trade Ad Automation</h1>
          <p className="text-gray-300 text-[1.2vw] md:text-base" style={{marginBottom: '0.5vw'}}>Post trade ads to Rolimons automatically</p>
        </div>

        {/* Offer Card Section */}
        <div className="py-[1vw] border-b border-gray-800">
          <h2 className="text-[2vw] md:text-xl font-bold text-white mb-[0.5vw] text-center">Offer</h2>
          <div className="flex flex-wrap gap-[1vw] justify-center mb-[2vw]" style={{alignItems: 'flex-start'}}>
            {offerItemIds.map((id, idx) => (
              <div key={idx} className="min-w-[40px] w-[18vw] max-w-[120px] h-[7vw] max-h-[48px] bg-[#181A20] rounded flex items-center justify-center border border-[#333]">
                <input
                  type="text"
                  value={id}
                  onChange={(e) => handleOfferItemChange(idx, e.target.value)}
                  placeholder={`ID ${idx + 1}`}
                  className="w-full h-full bg-transparent text-center text-white placeholder-gray-400 outline-none font-bold text-[1vw] md:text-xs"
                  style={{ background: "none" }}
                />
              </div>
            ))}
          </div>
          <div className="text-center mb-0" style={{fontSize: '1vw', marginBottom: '0.5vw'}}>
            <span className="font-bold">Value <span className="text-blue-400">{offerValue.toLocaleString()}</span></span>
          </div>
          <div className="text-center mb-0" style={{fontSize: '1vw', marginBottom: '0.5vw'}}>
            <span className="font-bold text-green-400">RAP {offerValue.toLocaleString()}</span>
          </div>
        </div>

        {/* Request Card Section */}
        <div className="py-[1vw] border-b border-gray-800">
          <h2 className="text-[2vw] md:text-xl font-bold text-white mb-[0.5vw] text-center">Request</h2>
          <div className="flex flex-wrap gap-[1vw] justify-center mb-[2vw]" style={{alignItems: 'flex-start'}}>
            {Array.from({ length: maxSlots }).map((_, idx) => {
              const slot = requestSlots[idx];
              if (slot) {
                if (filledItemIds.includes(slot)) {
                  // Item ID slot
                  return (
                    <div key={idx} className="min-w-[40px] w-[18vw] max-w-[120px] h-[7vw] max-h-[48px] bg-[#181A20] rounded flex items-center justify-center border border-[#333]">
                      <input
                        type="text"
                        value={slot}
                        onChange={(e) => handleRequestItemChange(idx, e.target.value)}
                        placeholder={`ID ${idx + 1}`}
                        className="w-full h-full bg-transparent text-center text-white placeholder-gray-400 outline-none font-bold text-[1vw] md:text-xs"
                        style={{ background: "none" }}
                      />
                    </div>
                  );
                } else if (filledTags.includes(slot)) {
                  // Tag slot
                  return (
                    <div key={idx} className="min-w-[40px] w-[18vw] max-w-[120px] h-[7vw] max-h-[48px] bg-[#181A20] rounded flex flex-col items-center justify-center border border-blue-600" style={{padding: '0.5vw'}}>
                      <span className="px-1 py-1 rounded-full bg-blue-600 text-white text-[1vw] md:text-xs font-bold border border-blue-400 shadow">{slot.toUpperCase()}</span>
                    </div>
                  );
                }
              } else {
                // Empty slot
                return (
                  <div key={idx} className="min-w-[40px] w-[18vw] max-w-[120px] h-[7vw] max-h-[48px] bg-[#181A20] rounded flex items-center justify-center border border-[#333]">
                    <input
                      type="text"
                      value={""}
                      onChange={(e) => handleRequestItemChange(idx, e.target.value)}
                      placeholder={`ID ${idx + 1}`}
                      className="w-full h-full bg-transparent text-center text-white placeholder-gray-400 outline-none font-bold text-[1vw] md:text-xs"
                      style={{ background: "none" }}
                    />
                  </div>
                );
              }
            })}
          </div>
          <div className="text-center mb-0" style={{fontSize: '1vw', marginBottom: '0.5vw'}}>
            <span className="font-bold">Value <span className="text-blue-400">{requestValue.toLocaleString()}</span></span>
          </div>
          <div className="text-center mb-0" style={{fontSize: '1vw', marginBottom: '0.5vw'}}>
            <span className="font-bold text-green-400">RAP {requestValue.toLocaleString()}</span>
          </div>
        </div>

        {/* Selector mode switch and TradeAdSelector */}
        <div className="w-full flex flex-col items-center border-b border-gray-800">
          <div className="flex gap-[1vw] justify-center mb-[1vw] w-full">
            <button
              className={`min-w-[80px] w-[20vw] max-w-[220px] px-[2vw] py-[1vw] rounded font-bold text-[1.5vw] md:text-base ${selectorMode === 'offer' ? 'bg-blue-600 text-white' : 'bg-[#181A20] text-gray-400'}`}
              onClick={() => setSelectorMode('offer')}
            >
              Add to Offer
            </button>
            <button
              className={`min-w-[80px] w-[20vw] max-w-[220px] px-[2vw] py-[1vw] rounded font-bold text-[1.5vw] md:text-base ${selectorMode === 'request' ? 'bg-blue-600 text-white' : 'bg-[#181A20] text-gray-400'}`}
              onClick={() => setSelectorMode('request')}
            >
              Add to Request
            </button>
          </div>
          <div className="w-full">
            <TradeAdSelector
              mode={selectorMode}
              selectedTags={selectedTags}
              toggleTag={toggleTag}
              searchValue={selectorMode === 'offer' ? searchOffer : searchRequest}
              setSearchValue={selectorMode === 'offer' ? setSearchOffer : setSearchRequest}
            />
          </div>
        </div>

        {/* Tag Buttons Section removed for compactness */}

        {/* Player ID & Roli Verification Section */}
        <form onSubmit={handleSubmit} className="py-[1vw] border-b border-gray-800">
          <div className="max-w-[98vw] mx-auto grid grid-cols-1 gap-[1vw]">
            <div>
              <label htmlFor="playerId" className="block text-[1.2vw] md:text-base font-medium text-gray-300 mb-[0.5vw]">Enter your Roblox Player ID</label>
              <input
                type="text"
                id="playerId"
                value={playerId}
                onChange={(e) => setPlayerId(e.target.value)}
                placeholder="Player ID"
                className="w-full px-[2vw] py-[1vw] bg-[#181A20] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-[1.2vw] md:text-base"
                required
              />
            </div>
            <div>
              <label htmlFor="roliVerification" className="block text-[1.2vw] md:text-base font-medium text-gray-300 mb-[0.5vw]">Enter your _RoliVerification cookie</label>
              <input
                type="password"
                id="roliVerification"
                value={roliVerification}
                onChange={(e) => setRoliVerification(e.target.value)}
                placeholder="_RoliVerification cookie"
                className="w-full px-[2vw] py-[1vw] bg-[#181A20] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-[1.2vw] md:text-base"
                required
              />
              <p className="text-[1vw] md:text-xs text-gray-500 mt-[0.5vw] text-center">Find this in your browser's developer tools under Application → Cookies → rolimons.com</p>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-center mt-[1vw]">
            <button
              type="submit"
              disabled={isLoading}
              className="min-w-[80px] w-[20vw] max-w-[220px] px-[2vw] py-[1vw] bg-blue-600 text-white rounded font-semibold text-[1.5vw] md:text-base shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Posting...
                </span>
              ) : (
                "Submit"
              )}
            </button>
          </div>
        </form>

        {/* VS Code-like Terminal Output */}
        <div className="py-[1vw]" style={{maxWidth: '650px', margin: '0 auto'}}>
          <div className="w-full max-w-[600px] mx-auto bg-black rounded-lg shadow-inner border border-gray-800 p-[1vw] text-[1vw] md:text-xs font-mono h-[8vw] md:h-16 overflow-y-auto">
            {terminalLogs.map((line, idx) => (
              <div key={idx} className={
                line.toLowerCase().includes("success") ? "text-green-400" :
                line.toLowerCase().includes("fail") || line.toLowerCase().includes("error") ? "text-red-400" :
                "text-gray-300"
              }>{line}</div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="py-[0.5vw] border-t border-gray-800" style={{maxWidth: '650px', margin: '0 auto'}}>
          <p className="text-[1vw] md:text-xs text-gray-500 text-center" style={{maxWidth: '600px', margin: '0 auto'}}>Keep your Roli Verification cookie safe. Never share it with anyone.</p>
        </div>
      </div>
    </div>
  );
} 

export default App;
