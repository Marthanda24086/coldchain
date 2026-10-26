/**
 * CoolChain Product & Batch Management
 * Handles product catalogs, localStorage persistence, DHT11 capability checks,
 * batches, calibration offsets, and uncertainty guard bands.
 */

const DEFAULT_PRODUCTS_FALLBACK = [
  {
    "id": "vaccines",
    "name": "Vaccines",
    "emoji": "💉",
    "category": "Pharmaceuticals",
    "tempMin": 2.0,
    "tempMax": 8.0,
    "setpoint": 5.0,
    "humMin": 30.0,
    "humMax": 60.0,
    "warningMarginTemp": 0.5,
    "warningMarginHum": 3.0,
    "gracePeriodMinutes": 5,
    "baseShelfLifeDays": 365,
    "q10Factor": 2.0,
    "notes": "Typical WHO vaccine storage (2-8 °C). Always verify against product label."
  },
  {
    "id": "insulin",
    "name": "Insulin & Biologics",
    "emoji": "🧪",
    "category": "Pharmaceuticals",
    "tempMin": 2.0,
    "tempMax": 8.0,
    "setpoint": 5.0,
    "humMin": 30.0,
    "humMax": 60.0,
    "warningMarginTemp": 0.5,
    "warningMarginHum": 3.0,
    "gracePeriodMinutes": 5,
    "baseShelfLifeDays": 730,
    "q10Factor": 2.0,
    "notes": "Must never freeze. Typical 2-8 °C storage for unopened vials."
  },
  {
    "id": "whole-blood",
    "name": "Whole Blood",
    "emoji": "🩸",
    "category": "Medical & Clinical",
    "tempMin": 2.0,
    "tempMax": 6.0,
    "setpoint": 4.0,
    "humMin": 30.0,
    "humMax": 60.0,
    "warningMarginTemp": 0.5,
    "warningMarginHum": 3.0,
    "gracePeriodMinutes": 0,
    "baseShelfLifeDays": 35,
    "q10Factor": 2.2,
    "notes": "Strict 2-6 °C range with zero grace period for clinical transfusion safety."
  },
  {
    "id": "fresh-dairy",
    "name": "Fresh Milk & Dairy",
    "emoji": "🥛",
    "category": "Food & Beverage",
    "tempMin": 1.0,
    "tempMax": 4.0,
    "setpoint": 2.5,
    "humMin": 65.0,
    "humMax": 80.0,
    "warningMarginTemp": 0.5,
    "warningMarginHum": 3.0,
    "gracePeriodMinutes": 10,
    "baseShelfLifeDays": 14,
    "q10Factor": 2.0,
    "notes": "Rapid spoilage above 4 °C due to bacterial proliferation."
  },
  {
    "id": "fresh-meat",
    "name": "Fresh Meat & Poultry",
    "emoji": "🥩",
    "category": "Food & Beverage",
    "tempMin": 0.0,
    "tempMax": 4.0,
    "setpoint": 2.0,
    "humMin": 80.0,
    "humMax": 90.0,
    "warningMarginTemp": 0.5,
    "warningMarginHum": 3.0,
    "gracePeriodMinutes": 10,
    "baseShelfLifeDays": 7,
    "q10Factor": 2.1,
    "notes": "Preserves color and inhibits pathogen growth in cold meat supply."
  },
  {
    "id": "fresh-fish",
    "name": "Fresh Fish & Seafood",
    "emoji": "🐟",
    "category": "Food & Beverage",
    "tempMin": 0.0,
    "tempMax": 2.0,
    "setpoint": 1.0,
    "humMin": 85.0,
    "humMax": 95.0,
    "warningMarginTemp": 0.5,
    "warningMarginHum": 3.0,
    "gracePeriodMinutes": 5,
    "baseShelfLifeDays": 4,
    "q10Factor": 2.5,
    "notes": "Optimal near melting ice temperature (0-2 °C)."
  },
  {
    "id": "eggs",
    "name": "Eggs (Table)",
    "emoji": "🥚",
    "category": "Food & Beverage",
    "tempMin": 4.0,
    "tempMax": 7.0,
    "setpoint": 5.5,
    "humMin": 70.0,
    "humMax": 80.0,
    "warningMarginTemp": 0.5,
    "warningMarginHum": 3.0,
    "gracePeriodMinutes": 15,
    "baseShelfLifeDays": 28,
    "q10Factor": 1.8,
    "notes": "Prevents Salmonella replication while avoiding condensation on shells."
  },
  {
    "id": "leafy-greens",
    "name": "Leafy Greens",
    "emoji": "🥬",
    "category": "Produce",
    "tempMin": 0.0,
    "tempMax": 4.0,
    "setpoint": 2.0,
    "humMin": 90.0,
    "humMax": 95.0,
    "warningMarginTemp": 0.5,
    "warningMarginHum": 2.0,
    "gracePeriodMinutes": 15,
    "baseShelfLifeDays": 10,
    "q10Factor": 2.0,
    "notes": "High humidity essential to prevent wilting. Freezing causes cellular rupture."
  },
  {
    "id": "berries",
    "name": "Berries (Strawberries/Blueberries)",
    "emoji": "🍓",
    "category": "Produce",
    "tempMin": 0.0,
    "tempMax": 4.0,
    "setpoint": 2.0,
    "humMin": 90.0,
    "humMax": 95.0,
    "warningMarginTemp": 0.5,
    "warningMarginHum": 2.0,
    "gracePeriodMinutes": 10,
    "baseShelfLifeDays": 7,
    "q10Factor": 2.2,
    "notes": "Delicate fruit prone to rapid Botrytis grey mold if kept warm."
  },
  {
    "id": "apples",
    "name": "Apples",
    "emoji": "🍎",
    "category": "Produce",
    "tempMin": 1.0,
    "tempMax": 4.0,
    "setpoint": 2.5,
    "humMin": 90.0,
    "humMax": 95.0,
    "warningMarginTemp": 0.5,
    "warningMarginHum": 2.0,
    "gracePeriodMinutes": 30,
    "baseShelfLifeDays": 120,
    "q10Factor": 1.8,
    "notes": "Controlled cold storage slows respiration and ethylene biosynthesis."
  },
  {
    "id": "tomatoes",
    "name": "Tomatoes (Ripe)",
    "emoji": "🍅",
    "category": "Produce",
    "tempMin": 12.0,
    "tempMax": 15.0,
    "setpoint": 13.5,
    "humMin": 85.0,
    "humMax": 90.0,
    "warningMarginTemp": 0.5,
    "warningMarginHum": 3.0,
    "gracePeriodMinutes": 30,
    "baseShelfLifeDays": 14,
    "q10Factor": 1.8,
    "notes": "Chilling injury occurs below 10 °C causing mealy texture and flavor loss."
  },
  {
    "id": "bananas",
    "name": "Bananas (Green/Ripening)",
    "emoji": "🍌",
    "category": "Produce",
    "tempMin": 13.0,
    "tempMax": 15.0,
    "setpoint": 14.0,
    "humMin": 85.0,
    "humMax": 90.0,
    "warningMarginTemp": 0.5,
    "warningMarginHum": 3.0,
    "gracePeriodMinutes": 30,
    "baseShelfLifeDays": 10,
    "q10Factor": 2.0,
    "notes": "Severe peel browning occurs when stored below 13 °C."
  },
  {
    "id": "chocolate",
    "name": "Chocolate & Confectionery",
    "emoji": "🍫",
    "category": "Confectionery",
    "tempMin": 15.0,
    "tempMax": 18.0,
    "setpoint": 16.5,
    "humMin": 45.0,
    "humMax": 55.0,
    "warningMarginTemp": 0.5,
    "warningMarginHum": 3.0,
    "gracePeriodMinutes": 45,
    "baseShelfLifeDays": 365,
    "q10Factor": 1.5,
    "notes": "High humidity causes sugar bloom; high heat causes fat bloom."
  },
  {
    "id": "crt-medicines",
    "name": "Controlled Room Temp (CRT) Meds",
    "emoji": "💊",
    "category": "Pharmaceuticals",
    "tempMin": 15.0,
    "tempMax": 25.0,
    "setpoint": 20.0,
    "humMin": 30.0,
    "humMax": 60.0,
    "warningMarginTemp": 1.0,
    "warningMarginHum": 5.0,
    "gracePeriodMinutes": 60,
    "baseShelfLifeDays": 730,
    "q10Factor": 1.9,
    "notes": "USP Controlled Room Temperature definition: 20 to 25 °C with excursions 15-30 °C."
  },
  {
    "id": "frozen-food",
    "name": "Frozen Food (-18 °C or below)",
    "emoji": "🧊",
    "category": "Frozen Goods",
    "tempMin": -25.0,
    "tempMax": -18.0,
    "setpoint": -20.0,
    "humMin": 85.0,
    "humMax": 95.0,
    "warningMarginTemp": 1.0,
    "warningMarginHum": 3.0,
    "gracePeriodMinutes": 15,
    "baseShelfLifeDays": 180,
    "q10Factor": 2.0,
    "notes": "NOTICE: Requires temperature <= -18 °C. Outside DHT11 physical measuring limits!"
  }
];

class ProductManager {
  constructor() {
    this.storageKey = "coolchain_products_v1";
    this.activeKey = "coolchain_active_product_id";
    this.batchKey = "coolchain_batches_v1";
    this.calibrationKey = "coolchain_calibration_offsets";
    this.guardBandKey = "coolchain_guard_band_enabled";

    this.products = [];
    this.activeProductId = CONFIG.DEFAULT_PRODUCT || "vaccines";
    this.batches = [];
    this.activeBatchId = null;
    this.calibration = { tempOffset: 0.0, humOffset: 0.0 };
    this.guardBandEnabled = true;

    this.init();
  }

  async init() {
    this.loadCalibration();
    this.loadGuardBand();
    this.loadBatches();
    await this.loadProducts();
  }

  async loadProducts() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      try {
        this.products = JSON.parse(saved);
      } catch (e) {
        console.warn("Failed to parse stored products, resetting to defaults", e);
        this.products = [...DEFAULT_PRODUCTS_FALLBACK];
      }
    } else {
      try {
        const res = await fetch("data/default-products.json");
        if (res.ok) {
          this.products = await res.json();
        } else {
          this.products = [...DEFAULT_PRODUCTS_FALLBACK];
        }
      } catch (err) {
        // Fallback for file:// or offline
        this.products = [...DEFAULT_PRODUCTS_FALLBACK];
      }
      this.saveProducts();
    }

    const savedActive = localStorage.getItem(this.activeKey);
    if (savedActive && this.getProductById(savedActive)) {
      this.activeProductId = savedActive;
    } else if (this.products.length > 0) {
      this.activeProductId = this.products[0].id;
    }
  }

  saveProducts() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.products));
  }

  getProducts() {
    return this.products;
  }

  getProductById(id) {
    return this.products.find(p => p.id === id) || null;
  }

  getActiveProduct() {
    return this.getProductById(this.activeProductId) || this.products[0] || DEFAULT_PRODUCTS_FALLBACK[0];
  }

  setActiveProduct(id) {
    if (this.getProductById(id)) {
      this.activeProductId = id;
      localStorage.setItem(this.activeKey, id);
      window.dispatchEvent(new CustomEvent("coolchain:productChanged", { detail: { product: this.getActiveProduct() } }));
      return true;
    }
    return false;
  }

  saveProduct(productData) {
    const idx = this.products.findIndex(p => p.id === productData.id);
    if (idx >= 0) {
      this.products[idx] = { ...this.products[idx], ...productData };
    } else {
      this.products.push(productData);
    }
    this.saveProducts();
    window.dispatchEvent(new CustomEvent("coolchain:productsUpdated"));
    if (this.activeProductId === productData.id) {
      window.dispatchEvent(new CustomEvent("coolchain:productChanged", { detail: { product: this.getActiveProduct() } }));
    }
  }

  duplicateProduct(id) {
    const src = this.getProductById(id);
    if (!src) return null;
    const clone = {
      ...JSON.parse(JSON.stringify(src)),
      id: `${src.id}-copy-${Date.now().toString().slice(-4)}`,
      name: `${src.name} (Copy)`
    };
    this.products.push(clone);
    this.saveProducts();
    window.dispatchEvent(new CustomEvent("coolchain:productsUpdated"));
    return clone;
  }

  deleteProduct(id) {
    if (this.products.length <= 1) {
      alert("At least one product profile must remain.");
      return false;
    }
    this.products = this.products.filter(p => p.id !== id);
    if (this.activeProductId === id) {
      this.setActiveProduct(this.products[0].id);
    }
    this.saveProducts();
    window.dispatchEvent(new CustomEvent("coolchain:productsUpdated"));
    return true;
  }

  resetToDefaults() {
    this.products = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS_FALLBACK));
    this.saveProducts();
    this.setActiveProduct(this.products[0].id);
    window.dispatchEvent(new CustomEvent("coolchain:productsUpdated"));
  }

  exportProductsJSON() {
    return JSON.stringify(this.products, null, 2);
  }

  importProductsJSON(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Invalid format: expected array");
      for (const p of parsed) {
        if (!p.id || !p.name || typeof p.tempMin !== "number" || typeof p.tempMax !== "number") {
          throw new Error("Missing required product properties (id, name, tempMin, tempMax)");
        }
      }
      this.products = parsed;
      this.saveProducts();
      if (!this.getProductById(this.activeProductId)) {
        this.setActiveProduct(this.products[0].id);
      }
      window.dispatchEvent(new CustomEvent("coolchain:productsUpdated"));
      return { success: true, count: parsed.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // -------------------------------------------------------------
  // Sensor Capabilities & Guard Bands
  // -------------------------------------------------------------
  checkSensorCapability(product) {
    const p = product || this.getActiveProduct();
    const dht = CONFIG.DHT11;
    const warnings = [];

    // 1. Outside measuring range check
    if (p.tempMin < dht.TEMP_MIN || p.tempMax > dht.TEMP_MAX) {
      warnings.push({
        type: "OUT_OF_RANGE",
        field: "temperature",
        message: `Requires ${p.tempMin}°C to ${p.tempMax}°C, which exceeds DHT11 measuring limits (${dht.TEMP_MIN} to ${dht.TEMP_MAX} °C). Use a specialized probe such as DS18B20 or PT100.`
      });
    }

    if (p.humMin < dht.HUM_MIN || p.humMax > dht.HUM_MAX) {
      warnings.push({
        type: "OUT_OF_RANGE",
        field: "humidity",
        message: `Requires ${p.humMin}% to ${p.humMax}% RH, which exceeds DHT11 limits (${dht.HUM_MIN}% to ${dht.HUM_MAX}% RH).`
      });
    }

    // 2. Tolerance window narrower than 2x sensor accuracy
    const tempWindow = p.tempMax - p.tempMin;
    if (tempWindow < 2 * dht.TEMP_ACCURACY) {
      warnings.push({
        type: "NARROW_TOLERANCE",
        field: "temperature",
        message: `Allowed temperature window (${tempWindow.toFixed(1)}°C) is narrower than 2× DHT11 sensor accuracy (±${dht.TEMP_ACCURACY}°C = 4.0°C). Readings cannot reliably prove compliance.`
      });
    }

    const humWindow = p.humMax - p.humMin;
    if (humWindow < 2 * dht.HUM_ACCURACY) {
      warnings.push({
        type: "NARROW_TOLERANCE",
        field: "humidity",
        message: `Allowed humidity window (${humWindow.toFixed(1)}%) is narrower than 2× DHT11 sensor accuracy (±${dht.HUM_ACCURACY}% = 10%).`
      });
    }

    return {
      compatible: warnings.filter(w => w.type === "OUT_OF_RANGE").length === 0,
      reliable: warnings.length === 0,
      warnings
    };
  }

  // -------------------------------------------------------------
  // Guard Band & Calibration
  // -------------------------------------------------------------
  loadGuardBand() {
    const val = localStorage.getItem(this.guardBandKey);
    this.guardBandEnabled = val !== null ? val === "true" : true;
  }

  setGuardBand(enabled) {
    this.guardBandEnabled = !!enabled;
    localStorage.setItem(this.guardBandKey, String(this.guardBandEnabled));
    window.dispatchEvent(new CustomEvent("coolchain:settingsChanged"));
  }

  loadCalibration() {
    const val = localStorage.getItem(this.calibrationKey);
    if (val) {
      try {
        this.calibration = JSON.parse(val);
      } catch (e) {
        this.calibration = { tempOffset: 0.0, humOffset: 0.0 };
      }
    }
  }

  setCalibration(tempOffset, humOffset) {
    this.calibration = {
      tempOffset: parseFloat(tempOffset) || 0.0,
      humOffset: parseFloat(humOffset) || 0.0
    };
    localStorage.setItem(this.calibrationKey, JSON.stringify(this.calibration));
    window.dispatchEvent(new CustomEvent("coolchain:settingsChanged"));
  }

  applyCalibration(rawTemp, rawHum) {
    const t = rawTemp !== null && !isNaN(rawTemp) ? rawTemp + (this.calibration.tempOffset || 0) : null;
    const h = rawHum !== null && !isNaN(rawHum) ? rawHum + (this.calibration.humOffset || 0) : null;
    return { temp: t, hum: h };
  }

  // -------------------------------------------------------------
  // Batches
  // -------------------------------------------------------------
  loadBatches() {
    const val = localStorage.getItem(this.batchKey);
    if (val) {
      try {
        this.batches = JSON.parse(val);
      } catch (e) {
        this.batches = [];
      }
    }
  }

  saveBatches() {
    localStorage.setItem(this.batchKey, JSON.stringify(this.batches));
  }

  startBatch(name, productId, notes = "") {
    const newBatch = {
      id: `BATCH-${Date.now().toString().slice(-6)}`,
      name: name || `Batch ${new Date().toLocaleDateString()}`,
      productId: productId || this.activeProductId,
      startTime: new Date().toISOString(),
      endTime: null,
      notes: notes,
      status: "ACTIVE"
    };
    this.batches.unshift(newBatch);
    this.activeBatchId = newBatch.id;
    this.saveBatches();
    window.dispatchEvent(new CustomEvent("coolchain:batchesUpdated"));
    return newBatch;
  }

  endBatch(batchId) {
    const batch = this.batches.find(b => b.id === batchId);
    if (batch) {
      batch.endTime = new Date().toISOString();
      batch.status = "COMPLETED";
      if (this.activeBatchId === batchId) {
        this.activeBatchId = null;
      }
      this.saveBatches();
      window.dispatchEvent(new CustomEvent("coolchain:batchesUpdated"));
      return batch;
    }
    return null;
  }

  getActiveBatch() {
    return this.batches.find(b => b.status === "ACTIVE") || null;
  }

  getBatches() {
    return this.batches;
  }
}

// Global instance
window.productManager = new ProductManager();
