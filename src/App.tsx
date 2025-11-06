import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface TradeAdResponse {
  success: boolean;
  message: string;
}

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
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
    // Calculate current total requests
    const currentRequestItems = requestItemIds.filter((id) => id.trim() !== "").length;
    const currentTags = selectedTags.length;
    const totalRequests = currentRequestItems + currentTags;

    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      if (totalRequests >= 4) {
        setMessage({
          type: "error",
          text: "You can only request up to 4 items (combined item IDs and tags)",
        });
        setTimeout(() => setMessage(null), 3000);
        return;
      }
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      // Parse and validate inputs
      const playerIdNum = parseInt(playerId);
      if (isNaN(playerIdNum) || playerIdNum <= 0) {
        throw new Error("Please enter a valid player ID");
      }

      const offerIds = offerItemIds
        .filter((id) => id.trim() !== "")
        .map((id) => {
          const num = parseInt(id);
          if (isNaN(num) || num <= 0) {
            throw new Error(`Invalid offer item ID: ${id}`);
          }
          return num;
        });

      const requestIds = requestItemIds
        .filter((id) => id.trim() !== "")
        .map((id) => {
          const num = parseInt(id);
          if (isNaN(num) || num <= 0) {
            throw new Error(`Invalid request item ID: ${id}`);
          }
          return num;
        });

      if (offerIds.length === 0) {
        throw new Error("Please enter at least one offer item ID");
      }

      if (offerIds.length > 4) {
        throw new Error("You can only offer up to 4 items");
      }

      if (requestIds.length + selectedTags.length === 0) {
        throw new Error("Please enter at least one request item ID or select a tag");
      }

      if (requestIds.length + selectedTags.length > 4) {
        throw new Error("You can only request up to 4 items (combined item IDs and tags)");
      }

      if (roliVerification.trim() === "") {
        throw new Error("Please enter your Roli Verification cookie");
      }

      const request: TradeAdRequest = {
        player_id: playerIdNum,
        offer_item_ids: offerIds,
        request_item_ids: requestIds,
        request_tags: selectedTags,
        roli_verification: roliVerification.trim(),
      };

      const response = await invoke<TradeAdResponse>("post_trade_ad", { request });

      if (response.success) {
        setMessage({ type: "success", text: response.message });
        // Optionally clear form on success
        // setOfferItemIds(["", "", "", ""]);
        // setRequestItemIds(["", "", "", ""]);
        // setSelectedTags([]);
      } else {
        setMessage({ type: "error", text: response.message });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-apple-gray-900 via-apple-gray-800 to-apple-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <div className="bg-apple-gray-800/50 backdrop-blur-xl rounded-apple-lg shadow-apple-lg p-8 border border-apple-gray-700/50">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-semibold text-white mb-2 tracking-tight">
              Rolimons Trade Ad Automation
            </h1>
            <p className="text-apple-gray-400 text-sm">
              Post trade ads to Rolimons automatically
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Player ID */}
            <div>
              <label htmlFor="playerId" className="block text-sm font-medium text-apple-gray-300 mb-2">
                Player ID
              </label>
              <input
                type="text"
                id="playerId"
                value={playerId}
                onChange={(e) => setPlayerId(e.target.value)}
                placeholder="Enter your Roblox Player ID"
                className="w-full px-4 py-3 bg-apple-gray-700/50 border border-apple-gray-600 rounded-apple text-white placeholder-apple-gray-500 focus:outline-none focus:ring-2 focus:ring-apple-blue focus:border-transparent transition-all"
                required
              />
            </div>

            {/* Offer Items */}
            <div>
              <label className="block text-sm font-medium text-apple-gray-300 mb-2">
                Offer Item IDs <span className="text-apple-gray-500">(up to 4)</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {offerItemIds.map((item, index) => (
                  <input
                    key={`offer-${index}`}
                    type="text"
                    value={item}
                    onChange={(e) => handleOfferItemChange(index, e.target.value)}
                    placeholder={`Item ID ${index + 1}${index === 0 ? " (required)" : ""}`}
                    className="px-4 py-3 bg-apple-gray-700/50 border border-apple-gray-600 rounded-apple text-white placeholder-apple-gray-500 focus:outline-none focus:ring-2 focus:ring-apple-blue focus:border-transparent transition-all"
                  />
                ))}
              </div>
            </div>

            {/* Request Items */}
            <div>
              <label className="block text-sm font-medium text-apple-gray-300 mb-2">
                Request Item IDs <span className="text-apple-gray-500">(optional, up to 4 combined with tags)</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {requestItemIds.map((item, index) => (
                  <input
                    key={`request-${index}`}
                    type="text"
                    value={item}
                    onChange={(e) => handleRequestItemChange(index, e.target.value)}
                    placeholder={`Item ID ${index + 1}`}
                    className="px-4 py-3 bg-apple-gray-700/50 border border-apple-gray-600 rounded-apple text-white placeholder-apple-gray-500 focus:outline-none focus:ring-2 focus:ring-apple-blue focus:border-transparent transition-all"
                  />
                ))}
              </div>
            </div>

            {/* Request Tags */}
            <div>
              <label className="block text-sm font-medium text-apple-gray-300 mb-3">
                Request Tags <span className="text-apple-gray-500">(select up to 4 combined with item IDs)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      selectedTags.includes(tag)
                        ? "bg-apple-blue text-white shadow-lg"
                        : "bg-apple-gray-700/50 text-apple-gray-300 hover:bg-apple-gray-600/50 border border-apple-gray-600"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              {selectedTags.length > 0 && (
                <p className="text-xs text-apple-gray-400 mt-2">
                  Selected: {selectedTags.join(", ")}
                </p>
              )}
            </div>

            {/* Roli Verification */}
            <div>
              <label htmlFor="roliVerification" className="block text-sm font-medium text-apple-gray-300 mb-2">
                Roli Verification Cookie
              </label>
              <input
                type="password"
                id="roliVerification"
                value={roliVerification}
                onChange={(e) => setRoliVerification(e.target.value)}
                placeholder="Enter your _RoliVerification cookie"
                className="w-full px-4 py-3 bg-apple-gray-700/50 border border-apple-gray-600 rounded-apple text-white placeholder-apple-gray-500 focus:outline-none focus:ring-2 focus:ring-apple-blue focus:border-transparent transition-all"
                required
              />
              <p className="text-xs text-apple-gray-500 mt-2">
                Find this in your browser's developer tools under Application → Cookies → rolimons.com
              </p>
            </div>

            {/* Message */}
            {message && (
              <div
                className={`p-4 rounded-apple ${
                  message.type === "success"
                    ? "bg-green-500/10 border border-green-500/30 text-green-400"
                    : "bg-red-500/10 border border-red-500/30 text-red-400"
                }`}
              >
                <p className="text-sm">{message.text}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-6 py-4 bg-apple-blue text-white rounded-apple font-medium text-lg shadow-apple hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-apple-blue focus:ring-offset-2 focus:ring-offset-apple-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Posting Trade Ad...
                </span>
              ) : (
                "Post Trade Ad"
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-apple-gray-700/50">
            <p className="text-xs text-apple-gray-500 text-center">
              Keep your Roli Verification cookie safe. Never share it with anyone.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
