/**
 * CoolChain Chart Engine
 * Resilient Chart.js visualizations for cold chain telemetry:
 * Live dual-axis trend, sparklines, SPC charts, histograms,
 * scatter plots, diurnal heatmaps, and shelf-life degradation curves.
 * Uses native string timestamps to guarantee 100% reliability with zero adapter failures.
 */

const Charts = (() => {
  const registry = {};

  // Color-blind safe palette (Okabe-Ito)
  const PALETTE = {
    temperature: "#E69F00",
    humidity:    "#56B4E9",
    rolling:     "#009E73",
    breach:      "#D55E00",
    warning:     "#F0E442",
    safe:        "#0072B2"
  };

  function destroyChart(key) {
    if (registry[key]) {
      try {
        registry[key].destroy();
      } catch (e) {
        console.warn("Error destroying chart", key, e);
      }
      delete registry[key];
    }
  }

  function getCtx(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    return el.getContext("2d");
  }

  function formatTime(isoStr, isLongRange = false) {
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return "";
      if (isLongRange) {
        return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return "";
    }
  }

  // -------------------------------------------------------------------------
  // Threshold Lines Plugin
  // -------------------------------------------------------------------------
  function makeThresholdPlugin(lines = []) {
    return {
      id: "thresholds",
      beforeDraw(chart) {
        const ctx = chart.ctx;
        const yAxis = chart.scales["y"];
        if (!yAxis) return;
        const xLeft = chart.chartArea.left;
        const xRight = chart.chartArea.right;
        ctx.save();
        for (const line of lines) {
          const yPx = yAxis.getPixelForValue(line.value);
          if (yPx < chart.chartArea.top || yPx > chart.chartArea.bottom) continue;
          ctx.beginPath();
          ctx.setLineDash(line.dash || [6, 4]);
          ctx.strokeStyle = line.color || "#999";
          ctx.lineWidth = line.width || 1.5;
          ctx.moveTo(xLeft, yPx);
          ctx.lineTo(xRight, yPx);
          ctx.stroke();
          ctx.setLineDash([]);
          if (line.label) {
            ctx.font = "11px Inter, sans-serif";
            ctx.fillStyle = line.color || "#999";
            ctx.fillText(line.label, xLeft + 6, yPx - 4);
          }
        }
        ctx.restore();
      }
    };
  }

  // -------------------------------------------------------------------------
  // Safe / Warning Background Band Plugin
  // -------------------------------------------------------------------------
  function makeSafeBandPlugin(minVal, maxVal, warnMargin, color = "rgba(0,178,0,0.06)", warnColor = "rgba(255,200,0,0.08)") {
    return {
      id: "safeBand",
      beforeDraw(chart) {
        const ctx = chart.ctx;
        const yAxis = chart.scales["y"];
        if (!yAxis) return;
        const { left, right, top, bottom } = chart.chartArea;
        ctx.save();
        const yMin = yAxis.getPixelForValue(minVal + warnMargin);
        const yMax = yAxis.getPixelForValue(maxVal - warnMargin);
        const yWarnMinOuter = yAxis.getPixelForValue(minVal);
        const yWarnMaxOuter = yAxis.getPixelForValue(maxVal);

        // Warning bands
        ctx.fillStyle = warnColor;
        ctx.fillRect(left, Math.min(yWarnMaxOuter, top), right - left, Math.abs(yMax - yWarnMaxOuter));
        ctx.fillRect(left, Math.max(yMin, top), right - left, Math.abs(yWarnMinOuter - yMin));

        // Safe band
        ctx.fillStyle = color;
        const safeTop = Math.max(Math.min(yMax, bottom), top);
        const safeBot = Math.min(Math.max(yMin, top), bottom);
        ctx.fillRect(left, safeTop, right - left, safeBot - safeTop);

        ctx.restore();
      }
    };
  }

  // -------------------------------------------------------------------------
  // 1. LIVE DUAL-AXIS CHART
  // -------------------------------------------------------------------------
  function buildLiveChart(canvasId, readings, product) {
    destroyChart("live");
    const ctx = getCtx(canvasId);
    if (!ctx || !readings || readings.length === 0) return;

    try {
      const isLong = readings.length > 100 && (new Date(readings[readings.length - 1].time) - new Date(readings[0].time)) > 86400000;
      const labels = readings.map(r => formatTime(r.time, isLong));
      const temps = readings.map(r => r.temp);
      const hums = readings.map(r => r.hum);
      const rollingTemps = Analytics.calculateRollingAverages(temps, 12);

      const breachColors = readings.map(r => {
        const st = Analytics.evaluatePointStatus(r.temp, r.hum, product, window.productManager?.guardBandEnabled);
        if (st.status === "BREACH") return PALETTE.breach;
        if (st.status === "WARNING" || st.status === "UNCERTAIN") return PALETTE.warning;
        return PALETTE.temperature;
      });

      const thresholdPlugin = makeThresholdPlugin([
        { value: product.tempMax, color: PALETTE.breach, label: `Max ${product.tempMax}°C`, dash: [8, 4] },
        { value: product.tempMin, color: "#0072B2", label: `Min ${product.tempMin}°C`, dash: [8, 4] },
        { value: product.setpoint, color: PALETTE.rolling, label: `SP ${product.setpoint}°C`, dash: [4, 4], width: 1 }
      ]);

      const safeBandPlugin = makeSafeBandPlugin(
        product.tempMin, product.tempMax,
        product.warningMarginTemp || 0.5
      );

      registry["live"] = new Chart(ctx, {
        type: "line",
        plugins: [thresholdPlugin, safeBandPlugin],
        data: {
          labels,
          datasets: [
            {
              label: "Temperature (°C)",
              data: temps,
              borderColor: PALETTE.temperature,
              backgroundColor: "transparent",
              pointBackgroundColor: breachColors,
              pointRadius: readings.length > 120 ? 1 : 3,
              borderWidth: 2,
              tension: 0.2,
              yAxisID: "y"
            },
            {
              label: "Rolling Avg (°C)",
              data: rollingTemps,
              borderColor: PALETTE.rolling,
              backgroundColor: "transparent",
              pointRadius: 0,
              borderWidth: 1.5,
              borderDash: [5, 3],
              tension: 0.3,
              yAxisID: "y"
            },
            {
              label: "Humidity (%RH)",
              data: hums,
              borderColor: PALETTE.humidity,
              backgroundColor: "transparent",
              pointRadius: 0,
              borderWidth: 1.5,
              tension: 0.2,
              yAxisID: "y2"
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              grid: { color: "rgba(128,128,128,0.1)" },
              ticks: { maxTicksLimit: 8, color: "#888" }
            },
            y: {
              title: { display: true, text: "Temperature (°C)", color: PALETTE.temperature },
              grid: { color: "rgba(128,128,128,0.1)" },
              ticks: { color: PALETTE.temperature }
            },
            y2: {
              position: "right",
              title: { display: true, text: "Humidity (%RH)", color: PALETTE.humidity },
              grid: { drawOnChartArea: false },
              ticks: { color: PALETTE.humidity },
              min: 0, max: 100
            }
          },
          plugins: {
            legend: { position: "top", labels: { usePointStyle: true } }
          }
        }
      });
    } catch (err) {
      console.error("Live chart render error:", err);
    }
  }

  // -------------------------------------------------------------------------
  // 2. SPARKLINE
  // -------------------------------------------------------------------------
  function buildSparkline(canvasId, values, color = PALETTE.temperature) {
    destroyChart(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx || !values || values.length === 0) return;

    try {
      registry[canvasId] = new Chart(ctx, {
        type: "line",
        data: {
          labels: values.map((_, i) => i),
          datasets: [{
            data: values,
            borderColor: color,
            backgroundColor: "transparent",
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false } }
        }
      });
    } catch (err) {
      console.warn("Sparkline render error:", err);
    }
  }

  // -------------------------------------------------------------------------
  // 3. SPC CONTROL CHART
  // -------------------------------------------------------------------------
  function buildSPCChart(canvasId, readings, product) {
    destroyChart("spc");
    const ctx = getCtx(canvasId);
    if (!ctx || !readings || readings.length < 5) return;

    try {
      const isLong = readings.length > 100;
      const labels = readings.map(r => formatTime(r.time, isLong));
      const temps = readings.map(r => r.temp);
      const spc = Analytics.calculateSPC(temps);

      const pointColors = temps.map(v =>
        Math.abs(v - spc.mean) > 3 * spc.sigma ? PALETTE.breach :
        Math.abs(v - spc.mean) > 2 * spc.sigma ? "#CC7700" :
        PALETTE.temperature
      );

      const spcPlugin = makeThresholdPlugin([
        { value: spc.ucl3, color: PALETTE.breach, label: "+3σ", dash: [5, 3] },
        { value: spc.lcl3, color: PALETTE.breach, label: "-3σ", dash: [5, 3] },
        { value: spc.ucl2, color: "#CC7700", label: "+2σ", dash: [4, 4] },
        { value: spc.lcl2, color: "#CC7700", label: "-2σ", dash: [4, 4] },
        { value: spc.ucl1, color: "#999", label: "+1σ", dash: [3, 5] },
        { value: spc.lcl1, color: "#999", label: "-1σ", dash: [3, 5] },
        { value: spc.mean, color: "#0072B2", label: "Mean", dash: [8, 3], width: 2 }
      ]);

      registry["spc"] = new Chart(ctx, {
        type: "line",
        plugins: [spcPlugin],
        data: {
          labels,
          datasets: [{
            label: "Temperature (°C)",
            data: temps,
            borderColor: PALETTE.temperature,
            backgroundColor: "transparent",
            pointBackgroundColor: pointColors,
            pointRadius: readings.length > 120 ? 1.5 : 3,
            borderWidth: 1.5,
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: { ticks: { maxTicksLimit: 8, color: "#888" }, grid: { color: "rgba(128,128,128,0.1)" } },
            y: { title: { display: true, text: "Temperature (°C)" }, grid: { color: "rgba(128,128,128,0.1)" } }
          },
          plugins: { legend: { display: false } }
        }
      });
    } catch (err) {
      console.error("SPC chart render error:", err);
    }
  }

  // -------------------------------------------------------------------------
  // 4. HISTOGRAMS
  // -------------------------------------------------------------------------
  function buildHistogram(canvasId, values, label, color, limitMin, limitMax, binCount = 15) {
    destroyChart(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx || !values || values.length < 3) return;

    try {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const binWidth = (max - min) / binCount || 1;
      const bins = Array.from({ length: binCount }, (_, i) => ({
        label: (min + i * binWidth + binWidth / 2).toFixed(1),
        count: 0,
        isBreach: false
      }));

      for (const v of values) {
        const bi = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
        bins[bi].count++;
        if (v < limitMin || v > limitMax) bins[bi].isBreach = true;
      }

      const colors = bins.map(b => b.isBreach ? PALETTE.breach : color);

      registry[canvasId] = new Chart(ctx, {
        type: "bar",
        data: {
          labels: bins.map(b => b.label),
          datasets: [{
            label,
            data: bins.map(b => b.count),
            backgroundColor: colors
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { title: { display: true, text: label }, ticks: { maxTicksLimit: 10 } },
            y: { title: { display: true, text: "Readings" } }
          }
        }
      });
    } catch (err) {
      console.error("Histogram error:", err);
    }
  }

  // -------------------------------------------------------------------------
  // 5. TEMPERATURE vs HUMIDITY SCATTER PLOT
  // -------------------------------------------------------------------------
  function buildScatterChart(canvasId, readings) {
    destroyChart("scatter");
    const ctx = getCtx(canvasId);
    if (!ctx || !readings || readings.length < 3) return null;

    try {
      const points = readings.map(r => ({ x: r.temp, y: r.hum }));
      const xs = readings.map(r => r.temp);
      const ys = readings.map(r => r.hum);
      const reg = Analytics.calculateLinearRegression(xs, ys);
      const xMin = Math.min(...xs), xMax = Math.max(...xs);
      const regLine = [
        { x: xMin, y: reg.intercept + reg.slope * xMin },
        { x: xMax, y: reg.intercept + reg.slope * xMax }
      ];

      registry["scatter"] = new Chart(ctx, {
        type: "scatter",
        data: {
          datasets: [
            {
              label: "T vs RH Readings",
              data: points,
              backgroundColor: "rgba(86,180,233,0.5)",
              borderColor: PALETTE.humidity,
              pointRadius: 3
            },
            {
              label: `Trend (r=${reg.r.toFixed(2)})`,
              data: regLine,
              type: "line",
              borderColor: PALETTE.breach,
              backgroundColor: "transparent",
              pointRadius: 0,
              borderDash: [5, 3],
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: { title: { display: true, text: "Temperature (°C)" } },
            y: { title: { display: true, text: "Humidity (%RH)" } }
          },
          plugins: { legend: { position: "top" } }
        }
      });
      return reg;
    } catch (err) {
      console.error("Scatter chart error:", err);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // 6. COMPLIANCE DONUT CHART
  // -------------------------------------------------------------------------
  function buildComplianceDonut(canvasId, inRangePct, abovePct, belowPct) {
    destroyChart("complianceDonut");
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    try {
      registry["complianceDonut"] = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ["In Range", "Above Limit", "Below Limit"],
          datasets: [{
            data: [
              Math.max(0, inRangePct),
              Math.max(0, abovePct),
              Math.max(0, belowPct)
            ],
            backgroundColor: [PALETTE.safe, PALETTE.breach, "#56B4E9"],
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "65%",
          plugins: { legend: { position: "bottom" } }
        }
      });
    } catch (err) {
      console.error("Compliance donut error:", err);
    }
  }

  // -------------------------------------------------------------------------
  // 7. EXCURSIONS PER DAY BAR CHART
  // -------------------------------------------------------------------------
  function buildExcursionsPerDayChart(canvasId, excursionsPerDay) {
    destroyChart("excursionsPerDay");
    const ctx = getCtx(canvasId);
    if (!ctx || !excursionsPerDay) return;

    try {
      const keys = Object.keys(excursionsPerDay).sort();
      registry["excursionsPerDay"] = new Chart(ctx, {
        type: "bar",
        data: {
          labels: keys,
          datasets: [{
            label: "Excursion Events",
            data: keys.map(k => excursionsPerDay[k]),
            backgroundColor: PALETTE.breach,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { maxTicksLimit: 12 } },
            y: { beginAtZero: true, title: { display: true, text: "Count" }, ticks: { stepSize: 1 } }
          }
        }
      });
    } catch (err) {
      console.error("Excursions per day chart error:", err);
    }
  }

  // -------------------------------------------------------------------------
  // 8. Q10 SHELF LIFE CUMULATIVE CURVE
  // -------------------------------------------------------------------------
  function buildShelfLifeChart(canvasId, cumulativeCurve) {
    destroyChart("shelfLife");
    const ctx = getCtx(canvasId);
    if (!ctx || !cumulativeCurve || cumulativeCurve.length === 0) return;

    try {
      const isLong = cumulativeCurve.length > 50;
      const labels = cumulativeCurve.map(p => formatTime(p.time, isLong));

      registry["shelfLife"] = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Shelf Life Used (Actual)",
              data: cumulativeCurve.map(p => p.consumedDays),
              borderColor: PALETTE.breach,
              backgroundColor: "rgba(213,94,0,0.08)",
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              borderWidth: 2
            },
            {
              label: "Ideal (At Target Setpoint)",
              data: cumulativeCurve.map(p => p.idealDays),
              borderColor: PALETTE.safe,
              backgroundColor: "transparent",
              borderDash: [6, 4],
              pointRadius: 0,
              borderWidth: 1.5
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: { ticks: { maxTicksLimit: 8 } },
            y: { title: { display: true, text: "Days Consumed" }, min: 0 }
          },
          plugins: { legend: { position: "top" } }
        }
      });
    } catch (err) {
      console.error("Shelf life chart error:", err);
    }
  }

  // -------------------------------------------------------------------------
  // 9. DIURNAL HEATMAP
  // -------------------------------------------------------------------------
  function buildDiurnalHeatmap(containerId, readings) {
    const container = document.getElementById(containerId);
    if (!container || !readings || readings.length === 0) return;

    try {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const grid = Array.from({ length: 7 }, () => Array(24).fill(null));
      const counts = Array.from({ length: 7 }, () => Array(24).fill(0));

      for (const r of readings) {
        const d = new Date(r.time);
        if (isNaN(d.getTime())) continue;
        const day = d.getDay();
        const hour = d.getHours();
        if (r.temp !== null && !isNaN(r.temp)) {
          if (grid[day][hour] === null) grid[day][hour] = 0;
          grid[day][hour] += r.temp;
          counts[day][hour]++;
        }
      }

      const flatVals = grid.flat().map((v, i) => {
        const cnt = counts.flat()[i];
        return (v !== null && cnt > 0) ? v / cnt : null;
      }).filter(v => v !== null);

      const globalMin = flatVals.length > 0 ? Math.min(...flatVals) : 0;
      const globalMax = flatVals.length > 0 ? Math.max(...flatVals) : 10;

      function colorForTemp(t) {
        if (t === null) return "rgba(100,100,100,0.15)";
        const norm = Math.max(0, Math.min(1, (t - globalMin) / (globalMax - globalMin || 1)));
        const r = Math.round(norm > 0.66 ? 255 : norm > 0.33 ? (norm - 0.33) * 3 * 255 : 0);
        const g = Math.round(norm > 0.66 ? (1 - (norm - 0.66) * 3) * 255 : norm < 0.33 ? norm * 3 * 255 : 255);
        const b = Math.round(norm < 0.33 ? 255 * (1 - norm * 3) : 0);
        return `rgb(${r},${g},${b})`;
      }

      let html = `<div class="heatmap-wrap"><div class="heatmap-labels-hour">`;
      for (let h = 0; h < 24; h++) html += `<span>${h}h</span>`;
      html += `</div>`;
      for (let d = 0; d < 7; d++) {
        html += `<div class="heatmap-row"><span class="heatmap-day">${days[d]}</span>`;
        for (let h = 0; h < 24; h++) {
          const cnt = counts[d][h];
          const avg = (grid[d][h] !== null && cnt > 0) ? grid[d][h] / cnt : null;
          const label = avg !== null ? `${avg.toFixed(1)}°C` : "N/A";
          const bg = colorForTemp(avg);
          html += `<div class="heatmap-cell" style="background:${bg}" title="${days[d]} ${h}:00 — Avg ${label}">${avg !== null ? avg.toFixed(0) : ""}</div>`;
        }
        html += `</div>`;
      }
      html += `<div class="heatmap-legend">
        <span>${globalMin.toFixed(1)}°C</span>
        <div class="heatmap-gradient"></div>
        <span>${globalMax.toFixed(1)}°C</span>
      </div></div>`;
      container.innerHTML = html;
    } catch (err) {
      console.error("Heatmap render error:", err);
    }
  }

  // -------------------------------------------------------------------------
  // 10. MOVING AVERAGE OVERLAY
  // -------------------------------------------------------------------------
  function buildMovingAvgChart(canvasId, readings) {
    destroyChart("movingAvg");
    const ctx = getCtx(canvasId);
    if (!ctx || !readings || readings.length < 5) return;

    try {
      const isLong = readings.length > 100;
      const labels = readings.map(r => formatTime(r.time, isLong));
      const temps = readings.map(r => r.temp);
      const ma5min = Analytics.calculateRollingAverages(temps, 10);
      const ma1hr = Analytics.calculateRollingAverages(temps, 120);

      registry["movingAvg"] = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Raw Temperature",
              data: temps,
              borderColor: "rgba(230,159,0,0.35)",
              backgroundColor: "transparent",
              pointRadius: 0,
              borderWidth: 1,
              tension: 0.1
            },
            {
              label: "5-min Moving Avg",
              data: ma5min,
              borderColor: PALETTE.temperature,
              backgroundColor: "transparent",
              pointRadius: 0,
              borderWidth: 2,
              tension: 0.3
            },
            {
              label: "1-hr Moving Avg",
              data: ma1hr,
              borderColor: PALETTE.rolling,
              backgroundColor: "transparent",
              pointRadius: 0,
              borderWidth: 2.5,
              borderDash: [6, 3],
              tension: 0.4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: { ticks: { maxTicksLimit: 8 } },
            y: { title: { display: true, text: "Temperature (°C)" } }
          },
          plugins: { legend: { position: "top" } }
        }
      });
    } catch (err) {
      console.error("Moving avg chart error:", err);
    }
  }

  // -------------------------------------------------------------------------
  // 11. DOWNLOAD CHART AS PNG
  // -------------------------------------------------------------------------
  function downloadChart(key, filename) {
    const chart = registry[key];
    if (!chart) return;
    try {
      const url = chart.toBase64Image("image/png", 1.0);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `${key}_chart.png`;
      a.click();
    } catch (err) {
      console.error("Download chart error:", err);
    }
  }

  // -------------------------------------------------------------------------
  // 12. SUITABILITY MATRIX
  // -------------------------------------------------------------------------
  function computeSuitabilityMatrix(readings, allProducts) {
    return allProducts.map(p => {
      if (!readings || readings.length === 0) {
        return { product: p, inRangePct: "N/A", excursionCount: 0, pass: false };
      }
      const exc = Analytics.detectExcursions(readings, p);
      const pass = exc.timeInRangePct >= 99.0 && exc.excursions.filter(e => e.gracePeriodExceeded).length === 0;
      return {
        product: p,
        inRangePct: exc.timeInRangePct,
        excursionCount: exc.totalExcursions,
        gracePeriodViolations: exc.excursions.filter(e => e.gracePeriodExceeded).length,
        pass
      };
    });
  }

  return {
    PALETTE,
    destroyChart,
    buildLiveChart,
    buildSparkline,
    buildSPCChart,
    buildHistogram,
    buildScatterChart,
    buildComplianceDonut,
    buildExcursionsPerDayChart,
    buildShelfLifeChart,
    buildDiurnalHeatmap,
    buildMovingAvgChart,
    downloadChart,
    computeSuitabilityMatrix
  };
})();

window.Charts = Charts;
