/**
 * CoolChain Application Controller
 * Orchestrates ThingSpeak fetching, demo data generation, UI state,
 * auto-refresh, browser notifications, CSV/PDF exports, schema-driven products,
 * and reliable section navigation.
 */

const App = (() => {

  // ── State ─────────────────────────────────────────────────────────────────
  let allReadings     = [];   // Central telemetry array for selected time window
  let rawFeedsCache   = [];   // Cached raw feeds from ThingSpeak
  let demoBuffer      = [];   // Streaming buffer for demo mode
  let refreshTimer    = null;
  let autoRefresh     = true;
  let currentSection  = "live";
  let timeRangeOption = "all"; // default to all available data so real points show immediately
  let customStart     = null;
  let customEnd       = null;
  let audioCtx        = null;
  let notifyEnabled   = false;
  let isFetching      = false;
  let lastFetchedTime = null;
  let channelInfo     = null;

  const DEMO_BANNER_ID  = "banner-demo";
  const ERROR_BANNER_ID = "banner-error";

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showBanner(id, msg, cls = "banner-error") {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className   = `banner ${cls}`;
    el.hidden      = false;
  }
  function hideBanner(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
  function fmtTemp(v)  { return v !== null && !isNaN(v) ? `${v.toFixed(1)} °C` : "—"; }
  function fmtHum(v)   { return v !== null && !isNaN(v) ? `${v.toFixed(1)} %` : "—"; }
  function fmtDur(ms)  {
    if (ms < 0 || isNaN(ms)) return "0 min";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  function el(id) { return document.getElementById(id); }
  function setText(id, txt) { const e = el(id); if (e) e.textContent = txt; }
  function setHTML(id, html) { const e = el(id); if (e) e.innerHTML = html; }

  // ── Demo Data Generator with Live Moving Telemetry ────────────────────────
  function generateDemoData(hours = 24) {
    const product    = window.productManager.getActiveProduct();
    const base       = (product.tempMin + product.tempMax) / 2;
    const humBase    = (product.hasHumidity && product.humMin !== null) ? (product.humMin + product.humMax) / 2 : 50;
    const now        = new Date();
    const totalPts   = Math.round((hours * 3600) / 30);

    if (demoBuffer.length === 0) {
      let temp = base;
      let hum  = humBase;
      for (let i = totalPts; i >= 0; i--) {
        const ts = new Date(now.getTime() - i * 30000);
        const hr = ts.getHours();
        const diurnal = 0.8 * Math.sin((hr / 24) * 2 * Math.PI);
        temp += (Math.random() - 0.5) * 0.6;
        temp = Math.round(Math.max(product.tempMin - 2, Math.min(product.tempMax + 3, temp + diurnal * 0.02)) * 10) / 10;
        hum += (Math.random() - 0.5) * 1.5;
        hum = Math.round(Math.max(20, Math.min(85, hum)));

        demoBuffer.push({
          time:             ts.toISOString(),
          rawTemp:          temp,
          rawHum:           hum,
          temp:             temp,
          hum:              product.hasHumidity !== false ? hum : null,
          deviceAlarm:      (temp < 2 || temp > 8) ? 1 : 0,
          deviceRollingAvg: null,
          deviceDeviation:  null,
          isDemo:           true
        });
      }
    } else {
      // Append a live moving data point
      const last = demoBuffer[demoBuffer.length - 1];
      let temp = last.temp + (Math.random() - 0.5) * 0.4;
      temp = Math.round(Math.max(product.tempMin - 2, Math.min(product.tempMax + 3, temp)) * 10) / 10;
      let hum = (last.hum !== null ? last.hum : humBase) + (Math.random() - 0.5) * 1.0;
      hum = Math.round(Math.max(20, Math.min(85, hum)));

      demoBuffer.push({
        time:             now.toISOString(),
        rawTemp:          temp,
        rawHum:           hum,
        temp:             temp,
        hum:              product.hasHumidity !== false ? hum : null,
        deviceAlarm:      (temp < 2 || temp > 8) ? 1 : 0,
        deviceRollingAvg: null,
        deviceDeviation:  null,
        isDemo:           true
      });

      if (demoBuffer.length > totalPts + 50) {
        demoBuffer.shift();
      }
    }

    return demoBuffer;
  }

  // ── ThingSpeak Fetcher ────────────────────────────────────────────────────
  async function fetchWithRetry(url, retries = CONFIG.MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        return await resp.json();
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY_MS * attempt));
      }
    }
  }

  async function fetchThingSpeakFeeds() {
    const base    = CONFIG.THINGSPEAK_BASE_URL;
    const cid     = CONFIG.getChannelId ? CONFIG.getChannelId() : CONFIG.CHANNEL_ID;
    const key     = CONFIG.getReadApiKey ? CONFIG.getReadApiKey() : CONFIG.READ_API_KEY;
    const maxPts  = CONFIG.MAX_POINTS_PER_REQUEST;

    const url = `${base}/channels/${cid}/feeds.json?api_key=${key}&results=${maxPts}`;
    const data = await fetchWithRetry(url);

    if (data && data.channel) {
      channelInfo = data.channel;
      renderChannelInfo(channelInfo);
    }

    return (data && Array.isArray(data.feeds)) ? data.feeds : [];
  }

  function parseThingSpeakFeed(feed) {
    const rawTemp = parseFloat(feed.field1);
    const rawHum  = parseFloat(feed.field2);
    const product = window.productManager.getActiveProduct();

    const t = isNaN(rawTemp) ? null : rawTemp;
    const h = isNaN(rawHum) ? null : rawHum;

    return {
      time:             feed.created_at,
      rawTemp:          t,
      rawHum:           h,
      temp:             t,
      hum:              (product.hasHumidity !== false) ? h : null,
      deviceRollingAvg: parseFloat(feed.field3) || null,
      deviceDeviation:  parseFloat(feed.field4) || null,
      deviceAlarm:      parseInt(feed.field5) || 0,
      isDemo:           false
    };
  }

  // ── Time Range Filtering & Moving Stream Window ───────────────────────────
  function filterReadingsByTime(readings) {
    if (!readings || readings.length === 0) return [];
    if (timeRangeOption === "all") return readings;

    const now = new Date();
    let start, end;
    const batch = window.productManager.getActiveBatch();

    if (timeRangeOption === "batch" && batch) {
      start = new Date(batch.startTime);
      end   = batch.endTime ? new Date(batch.endTime) : now;
    } else if (timeRangeOption === "custom" && customStart && customEnd) {
      start = new Date(customStart);
      end   = new Date(customEnd);
    } else {
      const hours = parseFloat(timeRangeOption) || 24;
      const latestTime = new Date(readings[readings.length - 1].time).getTime();
      // If the latest telemetry point was received within 3 hours of now, anchor to current real time
      // Otherwise anchor to the latest point in the stream so the selected moving window shows the actual slice of data
      const anchorTime = (now.getTime() - latestTime < 3 * 3600000) ? now.getTime() : latestTime;
      start = new Date(anchorTime - hours * 3600000);
      end   = new Date(anchorTime);
    }

    const filtered = readings.filter(r => {
      const t = new Date(r.time).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });

    return filtered.length > 0 ? filtered : readings;
  }

  // ── Master Refresh ────────────────────────────────────────────────────────
  async function refresh() {
    if (isFetching) return;
    isFetching = true;
    hideBanner(ERROR_BANNER_ID);

    try {
      if (isDemoMode()) {
        showBanner(DEMO_BANNER_ID, "Demo Mode — Configure your ThingSpeak Channel ID & Read Key to ingest live telemetry.", "banner-info");
        const demoReadings = generateDemoData(48);
        allReadings = demoReadings;
        lastFetchedTime = new Date();
      } else {
        hideBanner(DEMO_BANNER_ID);
        const feeds = await fetchThingSpeakFeeds();
        rawFeedsCache = feeds;
        const parsed = feeds.map(parseThingSpeakFeed).filter(r => r.temp !== null);
        allReadings = filterReadingsByTime(parsed);
        lastFetchedTime = new Date();
      }

      updateLastUpdated();
      renderAllSections();

    } catch (err) {
      showBanner(ERROR_BANNER_ID, `Data fetch error: ${err.message}. Retrying automatically...`, "banner-error");
      console.error("Fetch error:", err);
    } finally {
      isFetching = false;
    }
  }

  // ── Render All Sections ───────────────────────────────────────────────────
  function renderAllSections() {
    const product = window.productManager.getActiveProduct();
    renderTopBarStatus(product);

    if (currentSection === "live")             renderLive(product);
    else if (currentSection === "products")    renderProductsPage();
    else if (currentSection === "stats")       renderStats(product);
    else if (currentSection === "compliance")  renderCompliance(product);
    else if (currentSection === "trends")      renderTrends(product);
    else if (currentSection === "anomalies")   renderAnomalies(product);
    else if (currentSection === "health")      renderHealth(product);
    else if (currentSection === "reports")     renderReports(product);
  }

  // ── TOP BAR STATUS ────────────────────────────────────────────────────────
  function renderTopBarStatus(product) {
    if (!allReadings || allReadings.length === 0) {
      updateStatusBadge("NO DATA", "No telemetry points available.");
      setText("topbar-temp", "—");
      setText("topbar-hum",  "—");
      return;
    }

    const latest = allReadings[allReadings.length - 1];
    const st = Analytics.evaluatePointStatus(latest.temp, latest.hum, product, window.productManager.guardBandEnabled);
    updateStatusBadge(st.status, st.reason);

    setText("topbar-temp", fmtTemp(latest.temp));
    if (product.hasHumidity !== false && latest.hum !== null) {
      setText("topbar-hum", fmtHum(latest.hum));
    } else {
      setText("topbar-hum", "N/A");
    }
  }

  function updateStatusBadge(status, reason = "") {
    const badge = el("status-badge");
    if (!badge) return;
    badge.textContent = status;
    badge.className = `status-badge status-${status.toLowerCase()}`;
    badge.title = reason;

    if (status === "BREACH") {
      document.title = "[BREACH] CoolChain";
      if (notifyEnabled) sendBrowserNotification("CoolChain Alert", reason);
    } else {
      document.title = "CoolChain: Cold Chain Monitor";
    }
  }

  // ── SECTION 1: LIVE OVERVIEW ──────────────────────────────────────────────
  function renderLive(product) {
    if (!allReadings || allReadings.length === 0) {
      setHTML("live-status-banner", "<p>No telemetry data available for selected time range.</p>");
      setText("kpi-temp-val", "—");
      setText("kpi-hum-val", "—");
      setText("kpi-rolling-val", "—");
      setText("kpi-dev-val", "—");
      return;
    }

    const latest = allReadings[allReadings.length - 1];
    const prev = allReadings.length > 1 ? allReadings[allReadings.length - 2] : latest;

    const temps = allReadings.map(r => r.temp).filter(v => v !== null);
    const hums  = allReadings.map(r => r.hum).filter(v => v !== null);
    const rolling = Analytics.calculateRollingAverages(temps, 12);
    const rollingNow = rolling[rolling.length - 1] ?? latest.temp;
    const deviationNow = Analytics.calculateDeviation(latest.temp, product.setpoint);

    // KPI Cards
    const trendT = latest.temp - prev.temp;
    const trendH = (latest.hum !== null && prev.hum !== null) ? latest.hum - prev.hum : 0;
    setText("kpi-temp-val", fmtTemp(latest.temp));
    setText("kpi-temp-trend", trendT > 0.5 ? "↑" : trendT < -0.5 ? "↓" : "→");

    if (product.hasHumidity !== false && latest.hum !== null) {
      setText("kpi-hum-val", fmtHum(latest.hum));
      setText("kpi-hum-trend", trendH > 2 ? "↑" : trendH < -2 ? "↓" : "→");
    } else {
      setText("kpi-hum-val", "N/A (Temp Only)");
      setText("kpi-hum-trend", "—");
    }

    setText("kpi-rolling-val", fmtTemp(rollingNow));
    setText("kpi-dev-val", `${deviationNow > 0 ? "+" : ""}${deviationNow.toFixed(1)} %`);

    // Status Banner
    const st = Analytics.evaluatePointStatus(latest.temp, latest.hum, product, window.productManager.guardBandEnabled);
    const exc = Analytics.detectExcursions(allReadings, product);
    let bannerMsg = `<strong>${st.status}</strong>: ${st.reason}`;
    if (exc.longestExcursion) {
      bannerMsg += ` Longest excursion: ${exc.longestExcursion.durationMinutes} min.`;
    }
    const bannerClass = st.status === "BREACH" ? "status-banner breach" :
                        (st.status === "WARNING" || st.status === "UNCERTAIN") ? "status-banner warning" : "status-banner safe";
    setHTML("live-status-banner", `<p>${bannerMsg}</p>`);
    const bannerEl = el("live-status-banner");
    if (bannerEl) bannerEl.className = bannerClass;

    // Device Alarm Indicator & Mismatch Notice
    const deviceAlarm = latest.deviceAlarm;
    const siteIsBreaching = st.status === "BREACH";
    const mismatch = (deviceAlarm === 1) !== siteIsBreaching;
    setText("device-alarm-badge", deviceAlarm === 1 ? "Device Alarm ON" : "Device Alarm OFF");
    const mismatchEl = el("device-alarm-mismatch");
    if (mismatchEl) {
      if (mismatch) {
        mismatchEl.textContent = `Mismatch: ESP32 hardware uses fixed 2–8°C limits; active product profile evaluates ${product.name} (${product.tempMin}–${product.tempMax}°C).`;
        mismatchEl.hidden = false;
      } else {
        mismatchEl.hidden = true;
      }
    }

    // Charts & Live Moving Stream
    const sliceLen = allReadings.length > 500 ? 500 : allReadings.length;
    const visReadings = allReadings.slice(-sliceLen);
    setText("live-point-counter", `${visReadings.length} points plotted (live moving window)`);
    Charts.buildLiveChart("chart-live", visReadings, product);
    Charts.buildSparkline("spark-temp", temps.slice(-20), Charts.PALETTE.temperature);
    if (product.hasHumidity !== false && hums.length > 0) {
      Charts.buildSparkline("spark-hum", hums.slice(-20), Charts.PALETTE.humidity);
    }

    // Sensor Capability Check
    const cap = window.productManager.checkSensorCapability(product);
    const capWarn = el("sensor-cap-warning");
    if (capWarn) {
      if (cap.warnings.length > 0) {
        capWarn.innerHTML = cap.warnings.map(w => `<div class="cap-warn-item">Notice: ${w.message}</div>`).join("");
        capWarn.hidden = false;
      } else {
        capWarn.hidden = true;
      }
    }
  }

  // ── SECTION 2: STATISTICS ─────────────────────────────────────────────────
  function renderStats(product) {
    if (!allReadings || allReadings.length === 0) {
      setHTML("stats-content", "<p>No telemetry data available for statistics.</p>");
      return;
    }

    const temps = allReadings.map(r => r.temp).filter(v => v !== null && !isNaN(v));
    const hums  = allReadings.map(r => r.hum).filter(v => v !== null && !isNaN(v));
    const tStats = Analytics.calculateStats(temps);
    const hStats = Analytics.calculateStats(hums);
    const mkt    = Analytics.calculateMKT(temps);
    const latest = allReadings[allReadings.length - 1];
    const dp     = Analytics.calculateDewPoint(latest.temp, latest.hum);
    const rates  = Analytics.calculateRatesOfChange(allReadings);

    const recomputedRolling = Analytics.calculateRollingAverages(temps, 12);
    const recomputedLast    = recomputedRolling[recomputedRolling.length - 1] ?? 0;
    const deviceRollingVals = allReadings.filter(r => r.deviceRollingAvg !== null).map(r => r.deviceRollingAvg);
    const deviceRollingLast = deviceRollingVals.length > 0 ? deviceRollingVals[deviceRollingVals.length - 1] : null;

    const mktInRange = mkt >= product.tempMin && mkt <= product.tempMax;

    const statsHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <h4>Temperature Statistics</h4>
          ${renderStatTable(tStats, "°C")}
          <hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--border);" />
          <div class="stat-row"><span>Mean Kinetic Temp (MKT)</span><strong class="${mktInRange ? "" : "text-danger"}">${mkt.toFixed(2)} °C ${mktInRange ? "✓ In spec" : "⚠ Exceeds range"}</strong></div>
          <div class="stat-row"><span>Dew Point</span><strong>${dp !== null ? dp + " °C" : "N/A"}</strong></div>
          <div class="stat-row"><span>Rate of Change (Current)</span><strong>${rates.currentRate > 0 ? "+" : ""}${rates.currentRate} °C/min</strong></div>
          <div class="stat-row"><span>Max Rise Rate</span><strong>+${rates.maxRiseRate} °C/min</strong></div>
          <div class="stat-row"><span>Max Fall Rate</span><strong>${rates.maxFallRate} °C/min</strong></div>
          <div class="stat-row"><span>ESP32 Device Rolling Avg (field3)</span><strong>${deviceRollingLast !== null ? deviceRollingLast.toFixed(2) + " °C" : "N/A"}</strong></div>
          <div class="stat-row"><span>Site-Recomputed Rolling Avg</span><strong>${recomputedLast.toFixed(2)} °C</strong></div>
        </div>
        <div class="stat-card">
          <h4>Humidity Statistics</h4>
          ${product.hasHumidity !== false ? renderStatTable(hStats, "% RH") : "<p style='color:var(--text-muted); padding:1rem 0;'>Humidity tracking is omitted for this category (temperature-only profile).</p>"}
        </div>
      </div>`;
    setHTML("stats-content", statsHTML);
  }

  function renderStatTable(s, unit) {
    const rows = [
      ["Count", s.count, ""],
      ["Min", s.min, unit],
      ["Max", s.max, unit],
      ["Range", s.range, unit],
      ["Mean", s.mean, unit],
      ["Median", s.median, unit],
      ["Mode", s.mode, unit],
      ["Std Dev (σ)", s.stdDev, unit],
      ["Variance (σ²)", s.variance, unit + "²"],
      ["Coeff. of Variation", s.cv, "%"],
      ["P5 / P25 / P75 / P95 / P99", `${s.p5} / ${s.p25} / ${s.p75} / ${s.p95} / ${s.p99}`, unit],
      ["IQR", s.iqr, unit],
      ["Skewness", s.skewness, ""],
      ["Kurtosis", s.kurtosis, ""]
    ];
    return `<table class="stat-table">
      ${rows.map(([label, val, u]) => `<tr><td>${label}</td><td><strong>${val}${u ? " " + u : ""}</strong></td></tr>`).join("")}
    </table>`;
  }

  // ── SECTION 3: COMPLIANCE ─────────────────────────────────────────────────
  function renderCompliance(product) {
    if (!allReadings || allReadings.length === 0) {
      setText("compliance-score-val", "—");
      setHTML("excursion-table-body", "<tr><td colspan='8' class='no-data'>No data available.</td></tr>");
      return;
    }

    const exc = Analytics.detectExcursions(allReadings, product);
    const health = Analytics.calculateDataHealth(allReadings, CONFIG.DEVICE_INTERVAL_SECONDS);
    const compScore = Analytics.calculateComplianceScore(exc.timeInRangePct, exc.excursions, health.completenessPct);

    Charts.buildComplianceDonut("chart-compliance-donut", exc.timeInRangePct, exc.timeAbovePct, exc.timeBelowPct);

    setText("compliance-score-val", compScore);
    const scoreEl = el("compliance-score-val");
    if (scoreEl) {
      scoreEl.className = "score-value " + (compScore >= 95 ? "score-pass" : compScore >= 75 ? "score-warn" : "score-fail");
    }
    setText("compliance-time-in-range", `${exc.timeInRangePct.toFixed(1)}%`);
    setText("compliance-time-above", fmtDur(exc.timeAboveMs));
    setText("compliance-time-below", fmtDur(exc.timeBelowMs));
    setText("compliance-time-in-range-dur", fmtDur(exc.timeInRangeMs));

    // Excursions Log
    const tableRows = exc.excursions.map(e => `
      <tr class="exc-row sev-${e.severity.toLowerCase()}">
        <td>${new Date(e.startTime).toLocaleString()}</td>
        <td>${new Date(e.endTime).toLocaleString()}</td>
        <td>${e.durationMinutes} min</td>
        <td>${e.parameter}</td>
        <td>${e.direction}</td>
        <td>${e.peakValue.toFixed(1)}</td>
        <td><span class="badge badge-${e.severity.toLowerCase()}">${e.severity}</span></td>
        <td>${e.gracePeriodExceeded ? "Yes" : "No"}</td>
      </tr>`).join("");

    setHTML("excursion-table-body", tableRows || "<tr><td colspan='8' class='no-data'>No excursions detected (100% compliant) ✓</td></tr>");
    if (exc.longestExcursion) {
      setHTML("longest-excursion", `Longest Excursion: <strong>${exc.longestExcursion.durationMinutes} min</strong> (${exc.longestExcursion.parameter} ${exc.longestExcursion.direction}) starting ${new Date(exc.longestExcursion.startTime).toLocaleString()}`);
    } else {
      setHTML("longest-excursion", "");
    }

    // Storage Suitability Matrix
    const matrix = Charts.computeSuitabilityMatrix(allReadings, window.productManager.getProducts());
    const matrixRows = matrix.map(m => `
      <tr class="${m.pass ? "row-pass" : "row-fail"}">
        <td>${m.product.name}</td>
        <td>${typeof m.inRangePct === "number" ? m.inRangePct.toFixed(1) + "%" : "N/A"}</td>
        <td>${m.excursionCount}</td>
        <td>${m.gracePeriodViolations || 0}</td>
        <td>${m.pass ? '<span class="badge badge-pass">Pass</span>' : '<span class="badge badge-fail">Fail</span>'}</td>
      </tr>`).join("");
    setHTML("suitability-matrix-body", matrixRows);
  }

  // ── SECTION 5: TRENDS & PATTERNS ──────────────────────────────────────────
  function renderTrends(product) {
    if (!allReadings || allReadings.length === 0) return;

    const temps = allReadings.map(r => r.temp).filter(v => v !== null && !isNaN(v));
    const hums  = allReadings.map(r => r.hum).filter(v => v !== null && !isNaN(v));

    // 1. Moving Averages (5-min & 1-hr timestamp based)
    Charts.buildMovingAvgChart("chart-moving-avg", allReadings);

    // 2. Histograms
    Charts.buildHistogram("chart-hist-temp", temps, "Temperature (°C)", Charts.PALETTE.temperature, product.tempMin, product.tempMax);
    if (product.hasHumidity !== false && hums.length > 0) {
      Charts.buildHistogram("chart-hist-hum", hums, "Humidity (%RH)", Charts.PALETTE.humidity, product.humMin, product.humMax);
    }

    // 3. Scatter Plot & Pearson Correlation
    const scatterReg = Charts.buildScatterChart("chart-scatter", allReadings);
    if (scatterReg) {
      setText("scatter-correlation", `Pearson r = ${scatterReg.r.toFixed(3)}, R² = ${scatterReg.r2.toFixed(3)}`);
    } else {
      setText("scatter-correlation", "Insufficient paired (T, RH) telemetry");
    }

    // 4. Diurnal Heatmap
    Charts.buildDiurnalHeatmap("heatmap-container", allReadings);

    // 5. Trajectory Linear Projection
    const proj = Analytics.projectTrend(allReadings, product);
    if (proj) {
      setText("projection-slope", `${proj.slopePerHour > 0 ? "+" : ""}${proj.slopePerHour} °C/hr`);
      setText("projection-60",  `${proj.proj60}°C`);
      setText("projection-120", `${proj.proj120}°C`);
      setText("projection-180", `${proj.proj180}°C`);
      const warnEl = el("projection-warning");
      if (warnEl) {
        warnEl.hidden = !proj.breachWarning;
        warnEl.textContent = proj.breachWarning || "";
      }
    }
  }

  // ── SECTION 6: ANOMALIES ──────────────────────────────────────────────────
  function renderAnomalies(product) {
    const sliderEl = el("anomaly-sensitivity");
    const sensitivity = sliderEl ? parseFloat(sliderEl.value) : 3.0;

    if (!allReadings || allReadings.length < 5) {
      setHTML("anomaly-list", "<p>Need at least 5 readings for anomaly detection.</p>");
      return;
    }

    const anomalies = Analytics.detectAnomalies(allReadings, sensitivity);
    setText("anomaly-count", `${anomalies.length} anomalies detected`);

    const sevCls = { High: "badge-fail", Medium: "badge-sev-major", Low: "badge-pass", Info: "badge-info" };

    const rows = anomalies.map(a => `
      <div class="anomaly-item">
        <div class="anomaly-header">
          <span class="anomaly-type">${a.type.replace(/_/g, " ")}</span>
          <span class="badge ${sevCls[a.severity] || ""}">${a.severity}</span>
          <span class="anomaly-time">${new Date(a.time).toLocaleString()}</span>
          <span class="anomaly-val">${a.value?.toFixed(1)}°C</span>
        </div>
        <p class="anomaly-msg">${a.message}</p>
      </div>`).join("") || "<p class='no-data'>No statistical anomalies detected for current sensitivity level ✓</p>";

    setHTML("anomaly-list", rows);
  }

  // ── SECTION 7: DEVICE HEALTH ──────────────────────────────────────────────
  function renderHealth(product) {
    const health = Analytics.calculateDataHealth(allReadings, CONFIG.DEVICE_INTERVAL_SECONDS);
    setText("health-total-readings",   health.totalReadings);
    setText("health-completeness",     `${health.completenessPct.toFixed(1)}%`);
    setText("health-avg-interval",     `${health.avgIntervalSec.toFixed(1)} s`);
    setText("health-last-seen",        health.lastSeenTime ? new Date(health.lastSeenTime).toLocaleString() : "—");
    setText("health-first-seen",       allReadings.length > 0 ? new Date(allReadings[0].time).toLocaleString() : "—");
    setText("health-sensor-score",     health.sensorHealthScore);
    setText("health-status",           health.isOffline ? "OFFLINE" : "ONLINE");

    if (channelInfo) {
      setText("health-channel-name", channelInfo.name || "—");
      setText("health-channel-id",   channelInfo.id   || CONFIG.getChannelId());
      setText("health-channel-desc", channelInfo.description || "—");
    }
    updateApiConnectionBadge();

    const gapRows = health.gapsList.map(g =>
      `<tr><td>${new Date(g.start).toLocaleString()}</td><td>${new Date(g.end).toLocaleString()}</td><td>${Math.round(g.durationSec / 60)} min</td></tr>`
    ).join("") || "<tr><td colspan='3' class='no-data'>No significant data gaps recorded ✓</td></tr>";
    setHTML("health-gaps-table-body", gapRows);

    if (health.sensorSanityWarnings.length > 0) {
      setHTML("health-sanity-warnings", health.sensorSanityWarnings.map(w => `<li>Notice: ${w}</li>`).join(""));
    } else {
      setHTML("health-sanity-warnings", "<li>All DHT11 hardware measurements within valid physical thresholds ✓</li>");
    }
  }

  // ── SECTION 8: REPORTS & EXPORT ───────────────────────────────────────────
  function renderReports(product) {
    if (!allReadings || allReadings.length === 0) {
      setHTML("raw-table-body", "<tr><td colspan='7' class='no-data'>No data available.</td></tr>");
      return;
    }

    const pageSize = 50;
    let currentPage = parseInt(el("reports-page")?.value || "1");
    const totalPages = Math.ceil(allReadings.length / pageSize) || 1;
    currentPage = Math.min(Math.max(1, currentPage), totalPages);

    const pageSlice = allReadings.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const rows = pageSlice.map(r => {
      const st = Analytics.evaluatePointStatus(r.temp, r.hum, product, window.productManager.guardBandEnabled);
      const cls = st.status === "BREACH" ? "row-breach" : st.status === "WARNING" ? "row-warn" : "";
      return `<tr class="${cls}">
        <td>${new Date(r.time).toLocaleString()}</td>
        <td>${r.temp?.toFixed(1) ?? "—"} °C</td>
        <td>${r.hum !== null ? r.hum.toFixed(0) + " %" : "—"}</td>
        <td>${r.deviceRollingAvg?.toFixed(2) ?? "—"} °C</td>
        <td>${r.deviceDeviation?.toFixed(1) ?? "—"} %</td>
        <td>${r.deviceAlarm === 1 ? "Active" : "Normal"}</td>
        <td><span class="badge badge-${st.status.toLowerCase()}">${st.status}</span></td>
      </tr>`;
    }).join("");

    setHTML("raw-table-body", rows);
    setText("reports-page-info", `Page ${currentPage} of ${totalPages} (${allReadings.length} total readings)`);
  }

  function renderChannelInfo(info) {
    if (!info) return;
    setText("health-channel-name", info.name || "—");
    setText("health-channel-id",   info.id   || "—");
    setText("health-channel-desc", info.description || "—");
  }

  // ── SECTION 0: PRODUCTS & BATCHES ─────────────────────────────────────────
  function renderProductsPage() {
    populateInlineEditorWithActive();
    const products = window.productManager.getProducts();
    const activeId = window.productManager.activeProductId;

    const cards = products.map(p => {
      const cap = window.productManager.checkSensorCapability(p);
      const isActive = p.id === activeId;
      const humRange = (p.hasHumidity !== false && p.humMin !== null && p.humMax !== null)
        ? `<span>RH: ${p.humMin}–${p.humMax}%</span>` : `<span>RH: Not Monitored</span>`;

      return `<div class="product-card ${isActive ? "product-card-active" : ""}">
        <div class="product-card-header">
          <div>
            <h3>${p.name} ${isActive ? '<span class="badge badge-active">Active</span>' : ""}</h3>
            <small class="product-category">${p.category}</small>
          </div>
        </div>
        ${cap.warnings.length > 0 ? `<div class="cap-warning-tag">Sensor Limitation Notice</div>` : ""}
        <div class="product-limits">
          <span>Temp: ${p.tempMin}–${p.tempMax}°C</span>
          ${humRange}
          <span>Grace: ${p.gracePeriodMinutes} min</span>
        </div>
        <p class="product-notes">${p.notes || ""}</p>
        <div class="product-actions">
          <button class="btn btn-sm" onclick="App.activateProduct('${p.id}')">Monitor this</button>
          <button class="btn btn-sm btn-outline" onclick="App.openEditProduct('${p.id}')">Customize</button>
          <button class="btn btn-sm btn-outline" onclick="App.duplicateProduct('${p.id}')">Duplicate</button>
          <button class="btn btn-sm btn-danger" onclick="App.deleteProduct('${p.id}')">Delete</button>
        </div>
      </div>`;
    }).join("");

    setHTML("products-grid", cards);

    // Batches list
    const batches = window.productManager.getBatches();
    const batchRows = batches.map(b => {
      const dur = b.endTime ? fmtDur(new Date(b.endTime) - new Date(b.startTime)) : "Ongoing";
      return `<tr>
        <td>${b.id}</td>
        <td>${b.name}</td>
        <td>${b.productId}</td>
        <td>${new Date(b.startTime).toLocaleString()}</td>
        <td>${b.endTime ? new Date(b.endTime).toLocaleString() : "—"}</td>
        <td>${dur}</td>
        <td><span class="badge ${b.status === "ACTIVE" ? "badge-active" : "badge-pass"}">${b.status}</span></td>
        <td>${b.status === "ACTIVE" ? `<button class="btn btn-sm" onclick="App.endBatch('${b.id}')">End</button>` : ""}</td>
      </tr>`;
    }).join("") || "<tr><td colspan='8' class='no-data'>No batches recorded yet.</td></tr>";
    setHTML("batches-table-body", batchRows);
  }

  // ── SCHEMA-DRIVEN PRODUCT ACTIONS ─────────────────────────────────────────
  function onCategoryChange(category) {
    const schema = window.CATEGORY_SCHEMAS[category] || { hasHumidity: true };
    const humGroup = el("humidity-fields-group");
    if (humGroup) {
      if (schema.hasHumidity === false) {
        humGroup.classList.add("hidden");
      } else {
        humGroup.classList.remove("hidden");
      }
    }
  }

  function activateProduct(id) {
    window.productManager.setActiveProduct(id);
    updateProductSelector();
    refresh();
    renderProductsPage();
  }

  function populateInlineEditor(p) {
    if (!p) p = window.productManager.getActiveProduct();
    const form = el("product-form");
    if (!form) return;

    const fields = ["id", "name", "category", "tempMin", "tempMax", "setpoint",
                    "humMin", "humMax", "warningMarginTemp", "warningMarginHum",
                    "gracePeriodMinutes", "notes"];
    for (const f of fields) {
      const input = form.querySelector(`[name="${f}"]`);
      if (input) input.value = p ? (p[f] ?? "") : "";
    }

    onCategoryChange(p.category || "Custom");

    const titleEl = el("inline-editor-title");
    if (titleEl) titleEl.textContent = `Customize: ${p.name}`;
  }

  function populateInlineEditorWithActive() {
    populateInlineEditor(window.productManager.getActiveProduct());
  }

  function openEditProduct(id) {
    const p = id ? window.productManager.getProductById(id) : null;
    if (currentSection !== "products") {
      navigateTo("products");
    }
    if (p) {
      populateInlineEditor(p);
    } else {
      const newP = {
        id: `custom-${Date.now().toString().slice(-4)}`,
        name: "New Custom Product",
        category: "Custom",
        hasHumidity: true,
        tempMin: 2.0,
        tempMax: 8.0,
        setpoint: 5.0,
        humMin: 30.0,
        humMax: 60.0,
        warningMarginTemp: 0.5,
        warningMarginHum: 3.0,
        gracePeriodMinutes: 5,
        notes: "Custom product storage specifications."
      };
      populateInlineEditor(newP);
      const titleEl = el("inline-editor-title");
      if (titleEl) titleEl.textContent = "Create New Custom Product Profile";
    }
    setTimeout(() => {
      el("inline-product-editor-card")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  function saveProductFromForm() {
    const form = el("product-form");
    if (!form) return;
    const data = {};
    const numFields = ["tempMin", "tempMax", "setpoint", "humMin", "humMax", "warningMarginTemp", "warningMarginHum", "gracePeriodMinutes"];
    for (const f of form.querySelectorAll("[name]")) {
      data[f.name] = numFields.includes(f.name) ? (f.value !== "" ? parseFloat(f.value) : null) : f.value;
    }
    if (!data.id || data.id.trim() === "") {
      data.id = `custom-${Date.now().toString().slice(-4)}`;
    }

    const schema = window.CATEGORY_SCHEMAS[data.category] || { hasHumidity: true };
    data.hasHumidity = schema.hasHumidity !== false;

    if (!data.hasHumidity) {
      data.humMin = null;
      data.humMax = null;
      data.warningMarginHum = null;
    }

    window.productManager.saveProduct(data);
    window.productManager.setActiveProduct(data.id);
    renderProductsPage();
    updateProductSelector();
    refresh();
  }

  function duplicateProduct(id) {
    window.productManager.duplicateProduct(id);
    renderProductsPage();
  }

  function deleteProduct(id) {
    if (confirm(`Delete product "${window.productManager.getProductById(id)?.name}"?`)) {
      window.productManager.deleteProduct(id);
      renderProductsPage();
      updateProductSelector();
    }
  }

  function endBatch(id) {
    window.productManager.endBatch(id);
    renderProductsPage();
  }

  // ── EXPORTS ───────────────────────────────────────────────────────────────
  function downloadCSV(filename, rows, headers) {
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportRawCSV() {
    const product = window.productManager.getActiveProduct();
    const headers = ["Timestamp", "Temperature (°C)", "Humidity (%)", "Rolling Avg (°C)", "Dev (%)", "Device Alarm", "Status"];
    const rows = allReadings.map(r => {
      const st = Analytics.evaluatePointStatus(r.temp, r.hum, product, window.productManager.guardBandEnabled);
      return [r.time, r.temp?.toFixed(1) ?? "", r.hum?.toFixed(0) ?? "", r.deviceRollingAvg?.toFixed(2) ?? "", r.deviceDeviation?.toFixed(1) ?? "", r.deviceAlarm, st.status];
    });
    downloadCSV("coolchain_raw_data.csv", rows, headers);
  }

  function exportExcursionsCSV() {
    const product = window.productManager.getActiveProduct();
    const exc = Analytics.detectExcursions(allReadings, product);
    const headers = ["ID", "Start", "End", "Duration (min)", "Parameter", "Direction", "Peak Value", "Severity", "Grace Period Exceeded"];
    const rows = exc.excursions.map(e => [e.id, e.startTime, e.endTime, e.durationMinutes, e.parameter, e.direction, e.peakValue.toFixed(1), e.severity, e.gracePeriodExceeded ? "Yes" : "No"]);
    downloadCSV("coolchain_excursions.csv", rows, headers);
  }

  function exportStatsCSV() {
    const temps = allReadings.map(r => r.temp).filter(v => v !== null && !isNaN(v));
    const hums  = allReadings.map(r => r.hum).filter(v => v !== null && !isNaN(v));
    const ts = Analytics.calculateStats(temps);
    const hs = Analytics.calculateStats(hums);
    const mkt = Analytics.calculateMKT(temps);
    const headers = ["Metric", "Temperature (°C)", "Humidity (%)"];
    const rows = [
      ["Count", ts.count, hs.count], ["Min", ts.min, hs.min], ["Max", ts.max, hs.max],
      ["Mean", ts.mean, hs.mean], ["Median", ts.median, hs.median], ["StdDev", ts.stdDev, hs.stdDev],
      ["P5", ts.p5, hs.p5], ["P95", ts.p95, hs.p95], ["MKT", mkt.toFixed(2), "—"]
    ];
    downloadCSV("coolchain_statistics.csv", rows, headers);
  }

  function printReport() {
    const d = el("print-date");
    if (d) d.textContent = new Date().toLocaleString();
    window.print();
  }

  // ── UI HELPERS ─────────────────────────────────────────────────────────────
  function updateLastUpdated() {
    const now = isDemoMode() ? new Date() : (lastFetchedTime || new Date());
    setText("last-updated", now.toLocaleTimeString());
  }

  function updateProductSelector() {
    const sel = el("product-selector");
    if (!sel) return;
    const products = window.productManager.getProducts();
    const activeId = window.productManager.activeProductId;
    let opts = products.map(p =>
      `<option value="${p.id}" ${p.id === activeId ? "selected" : ""}>${p.name} (${p.tempMin}° to ${p.tempMax}°C)</option>`
    ).join("");
    opts += `<option value="__custom_new__">+ Create New Custom Product...</option>`;
    sel.innerHTML = opts;
  }

  // ── NOTIFICATIONS & AUDIO ─────────────────────────────────────────────────
  function requestNotifyPermission() {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then(p => { notifyEnabled = p === "granted"; });
  }

  function sendBrowserNotification(title, body) {
    if (!notifyEnabled || Notification.permission !== "granted") return;
    new Notification(title, { body });
  }

  // ── SECTION NAVIGATION (RELIABLE SPA) ─────────────────────────────────────
  function navigateTo(section) {
    currentSection = section;
    document.querySelectorAll(".nav-link").forEach(link => {
      link.classList.toggle("nav-active", link.dataset.section === section);
    });
    document.querySelectorAll(".section-panel").forEach(panel => {
      panel.hidden = (panel.id !== `section-${section}`);
    });
    renderAllSections();
  }

  // ── THEME ─────────────────────────────────────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem("coolchain_theme");
    const dark  = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    const btn = el("theme-toggle");
    if (btn) btn.textContent = dark ? "Light" : "Dark";
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const newTheme = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("coolchain_theme", newTheme);
    const btn = el("theme-toggle");
    if (btn) btn.textContent = newTheme === "dark" ? "Light" : "Dark";
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  async function init() {
    initTheme();

    await new Promise(resolve => setTimeout(resolve, 50));
    updateProductSelector();

    // Navigation setup
    document.querySelectorAll(".nav-link").forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo(link.dataset.section);
      });
    });

    // Product selector change
    const sel = el("product-selector");
    if (sel) sel.addEventListener("change", e => {
      if (e.target.value === "__custom_new__") {
        openEditProduct(null);
        e.target.value = window.productManager.activeProductId;
        return;
      }
      window.productManager.setActiveProduct(e.target.value);
      refresh();
    });

    // Time range selector
    const timeRange = el("time-range-selector");
    if (timeRange) timeRange.addEventListener("change", e => {
      const v = e.target.value;
      if (v === "custom") {
        timeRangeOption = "custom";
        el("custom-range-form").hidden = false;
      } else if (v === "batch") {
        timeRangeOption = "batch";
        el("custom-range-form").hidden = true;
      } else {
        timeRangeOption = v;
        el("custom-range-form").hidden = true;
        refresh();
      }
    });

    el("custom-range-apply")?.addEventListener("click", () => {
      customStart = el("custom-range-start")?.value;
      customEnd   = el("custom-range-end")?.value;
      if (customStart && customEnd) refresh();
    });

    // Auto-refresh toggle
    const arToggle = el("auto-refresh-toggle");
    if (arToggle) arToggle.addEventListener("change", e => {
      autoRefresh = e.target.checked;
      if (autoRefresh) startAutoRefresh();
      else stopAutoRefresh();
    });

    // Theme toggle
    el("theme-toggle")?.addEventListener("click", toggleTheme);

    // Guard band toggle
    const gbToggle = el("guard-band-toggle");
    if (gbToggle) {
      gbToggle.checked = window.productManager.guardBandEnabled;
      gbToggle.addEventListener("change", e => {
        window.productManager.setGuardBand(e.target.checked);
        refresh();
      });
    }

    // Product actions
    el("product-form-save")?.addEventListener("click", saveProductFromForm);
    el("btn-reset-products")?.addEventListener("click", () => {
      if (confirm("Reset all product profiles to defaults?")) {
        window.productManager.resetToDefaults();
        renderProductsPage();
        updateProductSelector();
      }
    });

    // Export buttons
    el("btn-export-products")?.addEventListener("click", () => {
      const json = window.productManager.exportProductsJSON();
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "coolchain_products.json";
      a.click();
    });

    el("btn-import-products")?.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = evt => {
          const res = window.productManager.importProductsJSON(evt.target.result);
          if (res.success) {
            alert(`Imported ${res.count} product profiles successfully.`);
            renderProductsPage();
            updateProductSelector();
          } else {
            alert(`Import failed: ${res.error}`);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });

    // Batch actions
    el("btn-start-batch")?.addEventListener("click", () => {
      const name = el("batch-name-input")?.value || "";
      const product = window.productManager.activeProductId;
      const notes = el("batch-notes-input")?.value || "";
      window.productManager.startBatch(name, product, notes);
      renderProductsPage();
    });

    // Reports exports
    el("btn-export-raw-csv")?.addEventListener("click", exportRawCSV);
    el("btn-export-excursions-csv")?.addEventListener("click", exportExcursionsCSV);
    el("btn-export-stats-csv")?.addEventListener("click", exportStatsCSV);
    el("btn-print-report")?.addEventListener("click", printReport);

    el("reports-page")?.addEventListener("input", () => {
      if (currentSection === "reports") {
        renderReports(window.productManager.getActiveProduct());
      }
    });

    // Anomaly sensitivity slider
    el("anomaly-sensitivity")?.addEventListener("input", e => {
      setText("anomaly-sensitivity-val", e.target.value);
      if (currentSection === "anomalies") renderAllSections();
    });

    // Notification toggle
    el("btn-notify")?.addEventListener("click", () => {
      requestNotifyPermission();
      notifyEnabled = !notifyEnabled;
      setText("btn-notify", notifyEnabled ? "Alerts ON" : "Alerts");
    });

    // Listen for product updates
    window.addEventListener("coolchain:productChanged", () => {
      updateProductSelector();
      refresh();
    });

    // Self-test
    console.group("CoolChain Self-Test Suite");
    const testResults = Analytics.runSelfTest();
    let allPass = true;
    for (const r of testResults) {
      const sym = r.pass ? "✓" : "✗";
      console.log(`${sym} [${r.testName}]`);
      if (!r.pass) allPass = false;
    }
    console.log(allPass ? "All self-tests passed." : "Some self-tests failed.");
    console.groupEnd();

    // Start
    navigateTo("live");
    await refresh();
    startAutoRefresh();
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    if (autoRefresh) {
      refreshTimer = setInterval(refresh, CONFIG.REFRESH_SECONDS * 1000);
    }
  }

  function stopAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  function saveApiSettings() {
    const cid = (el("api-channel-id-input")?.value || "").trim();
    const key = (el("api-read-key-input")?.value || "").trim();
    CONFIG.setCredentials(cid, key);
    channelInfo = null;
    allReadings = [];
    refresh();
    updateApiConnectionBadge();
    alert("ThingSpeak credentials saved and connected!");
  }

  function resetApiSettingsToDemo() {
    CONFIG.setCredentials("", "");
    if (el("api-channel-id-input")) el("api-channel-id-input").value = "";
    if (el("api-read-key-input")) el("api-read-key-input").value = "";
    channelInfo = null;
    allReadings = [];
    refresh();
    updateApiConnectionBadge();
    alert("Switched to Demo Mode.");
  }

  function updateApiConnectionBadge() {
    const pill = el("api-connection-status-pill");
    if (!pill) return;
    if (isDemoMode()) {
      pill.textContent = "Demo Mode Active";
      pill.className = "badge badge-info";
    } else {
      pill.textContent = `Connected: Channel #${CONFIG.getChannelId()}`;
      pill.className = "badge badge-pass";
    }
    const cidInput = el("api-channel-id-input");
    const keyInput = el("api-read-key-input");
    if (cidInput && !cidInput.value) cidInput.value = (CONFIG.getChannelId() === "YOUR_CHANNEL_ID") ? "" : CONFIG.getChannelId();
    if (keyInput && !keyInput.value) keyInput.value = (CONFIG.getReadApiKey() === "YOUR_READ_API_KEY") ? "" : CONFIG.getReadApiKey();
  }

  // Public API
  return {
    init,
    refresh,
    navigateTo,
    onCategoryChange,
    activateProduct,
    openEditProduct,
    saveProductFromForm,
    populateInlineEditorWithActive,
    duplicateProduct,
    deleteProduct,
    endBatch,
    exportRawCSV,
    exportExcursionsCSV,
    exportStatsCSV,
    printReport,
    saveApiSettings,
    resetApiSettingsToDemo,
    updateApiConnectionBadge
  };
})();

window.App = App;
document.addEventListener("DOMContentLoaded", App.init);
