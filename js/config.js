/**
 * CoolChain Configuration
 * -------------------------------------------------------------
 * LOCATION TO PLACE YOUR THINGSPEAK API KEY & CHANNEL ID:
 * 
 * Edit lines 17 and 18 below:
 * - Replace "YOUR_CHANNEL_ID" with your numeric ThingSpeak Channel ID (e.g. "2741920")
 * - Replace "YOUR_READ_API_KEY" with your ThingSpeak READ API Key (16 characters)
 * 
 * (Tip: You can also click the "⚙️ Connect ThingSpeak" button on the website
 *  to paste your Channel ID and Read API Key directly in your browser without code editing!)
 */

const CONFIG = {
  // =========================================================================
  // >>> PLACE YOUR THINGSPEAK CREDENTIALS HERE (LINES 17-18) <<<
  // =========================================================================
  CHANNEL_ID: "3549272",      // <--- Put your Channel ID here (e.g. "2741920")
  READ_API_KEY: "UI1EVIHCFTSO6QHR",  // <--- Put your 16-character READ API Key here

  // =========================================================================
  // TIMING & DEFAULTS
  // =========================================================================
  REFRESH_SECONDS: 30,                // Auto-refresh interval (seconds)
  DEVICE_INTERVAL_SECONDS: 30,         // Telemetry publication interval (seconds)
  DEFAULT_PRODUCT: "vaccines",         // Initial selected product

  // =========================================================================
  // API & CONNECTION SETTINGS
  // =========================================================================
  THINGSPEAK_BASE_URL: "https://api.thingspeak.com",
  MAX_POINTS_PER_REQUEST: 8000,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 3000,
  OFFLINE_THRESHOLD_MULTIPLIER: 3.0,

  // =========================================================================
  // DHT11 SENSOR SPECIFICATIONS
  // =========================================================================
  DHT11: {
    TEMP_MIN: 0.0,
    TEMP_MAX: 50.0,
    TEMP_ACCURACY: 2.0,
    HUM_MIN: 20.0,
    HUM_MAX: 90.0,
    HUM_ACCURACY: 5.0,
    RESOLUTION_TEMP: 1.0,
    RESOLUTION_HUM: 1.0,
    FLATLINE_MINUTES_SUSPICIOUS: 60
  },

  // Helper getters supporting both js/config.js and in-browser settings modal
  getChannelId() {
    const saved = localStorage.getItem("coolchain_channel_id");
    if (saved && saved.trim() !== "") return saved.trim();
    return CONFIG.CHANNEL_ID;
  },

  getReadApiKey() {
    const saved = localStorage.getItem("coolchain_read_api_key");
    if (saved && saved.trim() !== "") return saved.trim();
    return CONFIG.READ_API_KEY;
  },

  setCredentials(channelId, readKey) {
    if (channelId && channelId.trim()) {
      localStorage.setItem("coolchain_channel_id", channelId.trim());
    } else {
      localStorage.removeItem("coolchain_channel_id");
    }
    if (readKey && readKey.trim()) {
      localStorage.setItem("coolchain_read_api_key", readKey.trim());
    } else {
      localStorage.removeItem("coolchain_read_api_key");
    }
  }
};

/**
 * Checks whether the app should operate in Demo Mode
 * @returns {boolean} True if using placeholder credentials
 */
function isDemoMode() {
  const cid = CONFIG.getChannelId();
  return !cid || cid.trim() === "" || cid === "YOUR_CHANNEL_ID";
}

// Global exposure
window.CONFIG = CONFIG;
window.isDemoMode = isDemoMode;
