/**
 * CoolChain Configuration
 * -------------------------------------------------------------
 * THIS IS THE ONLY FILE YOU NEED TO EDIT TO CONNECT YOUR THINGSPEAK CHANNEL.
 * 
 * Instructions:
 * 1. Replace "YOUR_CHANNEL_ID" with your numeric ThingSpeak Channel ID (e.g. "1234567").
 * 2. Replace "YOUR_READ_API_KEY" with your ThingSpeak Read API Key (16 characters).
 *    (DO NOT enter your Write API Key or WiFi passwords here!)
 * 3. If left as "YOUR_CHANNEL_ID", CoolChain automatically runs in DEMO MODE
 *    with realistic simulated DHT11 cold-chain telemetry.
 */

const CONFIG = {
  // =========================================================
  // THINGPEAK CLOUD CREDENTIALS (EDIT HERE)
  // =========================================================
  CHANNEL_ID: "YOUR_CHANNEL_ID",      // e.g. "2741920" (numeric ID)
  READ_API_KEY: "YOUR_READ_API_KEY",  // 16-character ThingSpeak READ Key

  // =========================================================
  // TIMING & DEFAULTS
  // =========================================================
  REFRESH_SECONDS: 30,               // Auto-refresh interval for website (seconds)
  DEVICE_INTERVAL_SECONDS: 30,        // Expected time between ESP32 uploads (seconds)
  DEFAULT_PRODUCT: "vaccines",        // Initial active product ID from data/default-products.json

  // =========================================================
  // ADVANCED API / NETWORK SETTINGS
  // =========================================================
  THINGSPEAK_BASE_URL: "https://api.thingspeak.com",
  MAX_POINTS_PER_REQUEST: 8000,      // Max points ThingSpeak returns per query
  MAX_RETRIES: 3,                    // Automatic retries on network error
  RETRY_DELAY_MS: 3000,              // Retry backoff delay (ms)
  OFFLINE_THRESHOLD_MULTIPLIER: 3.0, // Mark device OFFLINE if no data for 3x interval (90s)

  // =========================================================
  // DHT11 SENSOR PHYSICAL CAPABILITIES & CONSTRAINTS
  // =========================================================
  DHT11: {
    TEMP_MIN: 0.0,                   // Minimum measurable temperature (°C)
    TEMP_MAX: 50.0,                  // Maximum measurable temperature (°C)
    TEMP_ACCURACY: 2.0,              // Nominal accuracy (±2 °C)
    HUM_MIN: 20.0,                   // Minimum measurable relative humidity (%)
    HUM_MAX: 90.0,                   // Maximum measurable relative humidity (%)
    HUM_ACCURACY: 5.0,               // Nominal accuracy (±5 % RH)
    RESOLUTION_TEMP: 1.0,            // Output resolution ~1 °C
    RESOLUTION_HUM: 1.0,             // Output resolution ~1 %
    FLATLINE_MINUTES_SUSPICIOUS: 60  // Flatlining threshold considering 1°C steps
  }
};

/**
 * Checks whether the app should operate in Demo Mode
 * @returns {boolean} True if using placeholder credentials
 */
function isDemoMode() {
  return !CONFIG.CHANNEL_ID || 
         CONFIG.CHANNEL_ID.trim() === "" || 
         CONFIG.CHANNEL_ID === "YOUR_CHANNEL_ID";
}

// Export to window
window.CONFIG = CONFIG;
window.isDemoMode = isDemoMode;
