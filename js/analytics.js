/**
 * CoolChain Mathematical & Analytics Engine
 * Pure modular functions for statistical calculations, MKT,
 * timestamp-based moving averages, excursions, anomalies, and DHT11 sanity checks.
 * Every function includes its mathematical formula in a concise comment.
 */

const Analytics = {
  // =========================================================================
  // 1. DESCRIPTIVE STATISTICS
  // =========================================================================

  // Formula: Mean = (1 / n) * sum(x_i)
  mean(values) {
    if (!values || values.length === 0) return 0;
    const sum = values.reduce((acc, v) => acc + v, 0);
    return sum / values.length;
  },

  // Formula: Median = middle value of sorted array (or mean of two middle values)
  median(values) {
    if (!values || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  },

  // Formula: Mode = value with highest frequency of occurrence
  mode(values) {
    if (!values || values.length === 0) return 0;
    const counts = {};
    let maxCount = 0;
    let modeVal = values[0];
    for (const v of values) {
      const rounded = Math.round(v * 10) / 10;
      counts[rounded] = (counts[rounded] || 0) + 1;
      if (counts[rounded] > maxCount) {
        maxCount = counts[rounded];
        modeVal = rounded;
      }
    }
    return modeVal;
  },

  // Formula: Variance = (1 / (n - 1)) * sum((x_i - mean)^2)
  variance(values, sampleMean = null) {
    if (!values || values.length < 2) return 0;
    const m = sampleMean !== null ? sampleMean : this.mean(values);
    const sumSq = values.reduce((acc, v) => acc + Math.pow(v - m, 2), 0);
    return sumSq / (values.length - 1);
  },

  // Formula: Standard Deviation = sqrt(variance)
  stdDev(values, sampleMean = null) {
    return Math.sqrt(this.variance(values, sampleMean));
  },

  // Formula: Coefficient of Variation = (stdDev / mean) * 100 %
  coeffOfVariation(values, sampleMean = null) {
    const m = sampleMean !== null ? sampleMean : this.mean(values);
    if (Math.abs(m) < 0.0001) return 0;
    return (this.stdDev(values, m) / Math.abs(m)) * 100;
  },

  // Formula: Percentile = value below which p% of observations fall
  percentile(values, p) {
    if (!values || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  },

  // Formula: Skewness = (n / ((n - 1)(n - 2))) * sum(((x_i - mean) / stdDev)^3)
  skewness(values, sampleMean = null, sampleStdDev = null) {
    const n = values ? values.length : 0;
    if (n < 3) return 0;
    const m = sampleMean !== null ? sampleMean : this.mean(values);
    const s = sampleStdDev !== null ? sampleStdDev : this.stdDev(values, m);
    if (s === 0) return 0;
    const sumCubed = values.reduce((acc, v) => acc + Math.pow((v - m) / s, 3), 0);
    return (n / ((n - 1) * (n - 2))) * sumCubed;
  },

  // Formula: Kurtosis = [ (n(n+1) / ((n-1)(n-2)(n-3))) * sum(((x_i - m)/s)^4) ] - (3(n-1)^2 / ((n-2)(n-3)))
  kurtosis(values, sampleMean = null, sampleStdDev = null) {
    const n = values ? values.length : 0;
    if (n < 4) return 0;
    const m = sampleMean !== null ? sampleMean : this.mean(values);
    const s = sampleStdDev !== null ? sampleStdDev : this.stdDev(values, m);
    if (s === 0) return 0;
    const sumFourth = values.reduce((acc, v) => acc + Math.pow((v - m) / s, 4), 0);
    const term1 = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * sumFourth;
    const term2 = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    return term1 - term2;
  },

  // Comprehensive statistical profile for an array of numbers
  calculateStats(values) {
    if (!values || values.length === 0) {
      return {
        count: 0, min: 0, max: 0, range: 0, mean: 0, median: 0, mode: 0,
        stdDev: 0, variance: 0, cv: 0,
        p5: 0, p25: 0, p75: 0, p95: 0, p99: 0, iqr: 0,
        skewness: 0, kurtosis: 0
      };
    }
    const count = values.length;
    let min = Infinity, max = -Infinity;
    for (const v of values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const m = this.mean(values);
    const s = this.stdDev(values, m);
    const v = s * s;
    const p25 = this.percentile(values, 25);
    const p75 = this.percentile(values, 75);

    return {
      count,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      range: Math.round((max - min) * 100) / 100,
      mean: Math.round(m * 100) / 100,
      median: Math.round(this.median(values) * 100) / 100,
      mode: Math.round(this.mode(values) * 100) / 100,
      stdDev: Math.round(s * 100) / 100,
      variance: Math.round(v * 1000) / 1000,
      cv: Math.round(this.coeffOfVariation(values, m) * 10) / 10,
      p5: Math.round(this.percentile(values, 5) * 100) / 100,
      p25: Math.round(p25 * 100) / 100,
      p75: Math.round(p75 * 100) / 100,
      p95: Math.round(this.percentile(values, 95) * 100) / 100,
      p99: Math.round(this.percentile(values, 99) * 100) / 100,
      iqr: Math.round((p75 - p25) * 100) / 100,
      skewness: Math.round(this.skewness(values, m, s) * 100) / 100,
      kurtosis: Math.round(this.kurtosis(values, m, s) * 100) / 100
    };
  },

  // =========================================================================
  // 2. MEAN KINETIC TEMPERATURE (MKT)
  // =========================================================================

  // Formula: Tk = (dH / R) / ( -ln( (1/n) * sum( exp( -dH / (R * T_i) ) ) ) )
  calculateMKT(tempCelsiusArray) {
    if (!tempCelsiusArray || tempCelsiusArray.length === 0) return 0;
    const DELTA_H = 83.144;     // Standard activation energy for pharmaceuticals in kJ/mol
    const R_GAS   = 0.0083144;  // Universal gas constant in kJ/(mol * K)
    const CONST_DIV = DELTA_H / R_GAS; // 10,000 Kelvin

    let sumExp = 0;
    let validCount = 0;

    for (const t of tempCelsiusArray) {
      if (t === null || isNaN(t)) continue;
      const tKelvin = t + 273.15;
      if (tKelvin <= 0) continue;
      sumExp += Math.exp(-CONST_DIV / tKelvin);
      validCount++;
    }

    if (validCount === 0 || sumExp === 0) return 0;
    const avgExp = sumExp / validCount;
    const mktKelvin = CONST_DIV / (-Math.log(avgExp));
    const mktCelsius = mktKelvin - 273.15;
    return Math.round(mktCelsius * 100) / 100;
  },

  // =========================================================================
  // 3. DEW POINT (MAGNUS-TETENS FORMULATION)
  // =========================================================================

  // Formula: Td = (237.7 * alpha) / (17.27 - alpha), where alpha = (17.27 * T)/(237.7 + T) + ln(RH / 100)
  calculateDewPoint(tempC, humRH) {
    if (tempC === null || humRH === null || isNaN(tempC) || isNaN(humRH) || humRH <= 0) return null;
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * tempC) / (b + tempC)) + Math.log(humRH / 100.0);
    const dewPoint = (b * alpha) / (a - alpha);
    return Math.round(dewPoint * 10) / 10;
  },

  // =========================================================================
  // 4. RATE OF CHANGE
  // =========================================================================

  // Formula: Rate = (T_now - T_prev) / deltaMinutes (°C / min)
  calculateRatesOfChange(readings) {
    if (!readings || readings.length < 2) {
      return { currentRate: 0, maxRiseRate: 0, maxFallRate: 0 };
    }
    let maxRise = 0;
    let maxFall = 0;
    let currentRate = 0;

    for (let i = 1; i < readings.length; i++) {
      const prev = readings[i - 1];
      const curr = readings[i];
      const dtMin = (new Date(curr.time) - new Date(prev.time)) / 60000;
      if (dtMin > 0 && dtMin <= 10) { // filter out large disconnect gaps
        const rate = (curr.temp - prev.temp) / dtMin;
        if (rate > maxRise) maxRise = rate;
        if (rate < maxFall) maxFall = rate;
        if (i === readings.length - 1) currentRate = rate;
      }
    }

    return {
      currentRate: Math.round(currentRate * 100) / 100,
      maxRiseRate: Math.round(maxRise * 100) / 100,
      maxFallRate: Math.round(maxFall * 100) / 100
    };
  },

  // =========================================================================
  // 5. ROLLING AVERAGE & SETPOINT DEVIATION (RECOMPUTED)
  // =========================================================================

  // Formula: RollingAvg_i = (1 / window) * sum(x_{i - k})
  calculateRollingAverages(values, windowSize = 12) {
    if (!values) return [];
    const result = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const slice = values.slice(start, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      result.push(Math.round(avg * 100) / 100);
    }
    return result;
  },

  /**
   * Timestamp-based Moving Average (5-min, 1-hr, etc.)
   * Evaluates all readings falling within (T - windowSeconds) to T
   */
  calculateTimestampMovingAverages(readings, windowSeconds = 300) {
    if (!readings || readings.length === 0) return [];
    const windowMs = windowSeconds * 1000;
    const result = [];

    let left = 0;
    let sum = 0;
    let count = 0;

    for (let right = 0; right < readings.length; right++) {
      const rightTime = new Date(readings[right].time).getTime();
      const val = readings[right].temp;

      if (val !== null && !isNaN(val)) {
        sum += val;
        count++;
      }

      // Evict points older than windowMs
      while (left <= right) {
        const leftTime = new Date(readings[left].time).getTime();
        if (rightTime - leftTime > windowMs) {
          const leftVal = readings[left].temp;
          if (leftVal !== null && !isNaN(leftVal)) {
            sum -= leftVal;
            count--;
          }
          left++;
        } else {
          break;
        }
      }

      result.push(count > 0 ? Math.round((sum / count) * 100) / 100 : null);
    }

    return result;
  },

  // Formula: DeviationPct = ((T - Setpoint) / Setpoint) * 100
  calculateDeviation(temp, setpoint) {
    if (temp === null || isNaN(temp)) return 0;
    if (Math.abs(setpoint) < 0.01) {
      return Math.round((temp - setpoint) * 100) / 100;
    }
    const dev = ((temp - setpoint) / setpoint) * 100.0;
    return Math.round(dev * 10) / 10;
  },

  // =========================================================================
  // 6. STATUS, GUARD BANDS & BREACH CLASSIFICATION
  // =========================================================================

  /**
   * Evaluates point status against product thresholds.
   * Humidity rules apply ONLY if product.hasHumidity !== false.
   */
  evaluatePointStatus(temp, hum, product, guardBandEnabled = true) {
    if (temp === null || isNaN(temp)) {
      return { status: "UNKNOWN", reason: "Missing sensor telemetry" };
    }

    const { tempMin, tempMax, humMin, humMax, warningMarginTemp, warningMarginHum, hasHumidity } = product;
    const dht = CONFIG.DHT11;
    const trackHum = hasHumidity !== false && humMin !== null && humMax !== null && hum !== null && !isNaN(hum);

    // Direct hard breach
    const tempBreach = temp < tempMin || temp > tempMax;
    const humBreach = trackHum ? (hum < humMin || hum > humMax) : false;

    if (tempBreach || humBreach) {
      let reasons = [];
      if (temp < tempMin) reasons.push(`Temp ${temp.toFixed(1)}°C below min limit (${tempMin}°C)`);
      if (temp > tempMax) reasons.push(`Temp ${temp.toFixed(1)}°C above max limit (${tempMax}°C)`);
      if (humBreach && hum < humMin) reasons.push(`Humidity ${hum.toFixed(1)}% below min (${humMin}%)`);
      if (humBreach && hum > humMax) reasons.push(`Humidity ${hum.toFixed(1)}% above max (${humMax}%)`);
      return { status: "BREACH", reason: reasons.join("; "), tempBreach, humBreach };
    }

    // Measurement uncertainty guard band check
    if (guardBandEnabled) {
      const tempNearMin = Math.abs(temp - tempMin) <= dht.TEMP_ACCURACY;
      const tempNearMax = Math.abs(temp - tempMax) <= dht.TEMP_ACCURACY;
      const humNearMin = trackHum ? Math.abs(hum - humMin) <= dht.HUM_ACCURACY : false;
      const humNearMax = trackHum ? Math.abs(hum - humMax) <= dht.HUM_ACCURACY : false;

      if (tempNearMin || tempNearMax || humNearMin || humNearMax) {
        return {
          status: "UNCERTAIN",
          reason: `Reading is within DHT11 tolerance window (±${dht.TEMP_ACCURACY}°C) of safe limits. Statistically uncertain.`,
          isGuardBand: true
        };
      }
    }

    // Pre-alert warning margin check
    const marginT = warningMarginTemp || 0.5;
    const marginH = warningMarginHum || 3.0;

    const tempWarning = (temp <= tempMin + marginT) || (temp >= tempMax - marginT);
    const humWarning = trackHum ? ((hum <= humMin + marginH) || (hum >= humMax - marginH)) : false;

    if (tempWarning || humWarning) {
      return {
        status: "WARNING",
        reason: `Approaching threshold limits within pre-alert margin (±${marginT}°C).`,
        tempWarning, humWarning
      };
    }

    return { status: "SAFE", reason: "All parameters within optimal product tolerance limits." };
  },

  // =========================================================================
  // 7. EXCURSION TRACKING & COMPLIANCE
  // =========================================================================

  /**
   * Groups contiguous breach readings into distinct excursion events,
   * evaluates grace period rules and assigns severity.
   */
  detectExcursions(readings, product) {
    if (!readings || readings.length === 0) {
      return {
        excursions: [],
        totalExcursions: 0,
        timeInRangePct: 100,
        timeAbovePct: 0,
        timeBelowPct: 0,
        timeInRangeMs: 0,
        timeAboveMs: 0,
        timeBelowMs: 0,
        longestExcursion: null,
        excursionsPerDay: {}
      };
    }

    const { tempMin, tempMax, humMin, humMax, gracePeriodMinutes, hasHumidity } = product;
    const graceMs = (gracePeriodMinutes || 0) * 60000;
    const trackHum = hasHumidity !== false && humMin !== null && humMax !== null;

    const excursions = [];
    let currentExcursion = null;

    let timeInRangeMs = 0;
    let timeAboveMs = 0;
    let timeBelowMs = 0;
    let totalMonitoredMs = 0;

    for (let i = 0; i < readings.length; i++) {
      const r = readings[i];
      const nextR = readings[i + 1];
      const dtMs = nextR ? Math.min(new Date(nextR.time) - new Date(r.time), 120000) : 30000;
      totalMonitoredMs += dtMs;

      const isHigh = r.temp !== null && r.temp > tempMax;
      const isLow = r.temp !== null && r.temp < tempMin;
      const isHumHigh = trackHum && r.hum !== null && r.hum > humMax;
      const isHumLow = trackHum && r.hum !== null && r.hum < humMin;
      const isBreach = isHigh || isLow || isHumHigh || isHumLow;

      if (isHigh || isHumHigh) timeAboveMs += dtMs;
      else if (isLow || isHumLow) timeBelowMs += dtMs;
      else timeInRangeMs += dtMs;

      if (isBreach) {
        let param = (isHigh || isLow) ? "Temperature" : "Humidity";
        let direction = (isHigh || isHumHigh) ? "HIGH" : "LOW";
        let extremeVal = (isHigh || isLow) ? r.temp : r.hum;

        if (!currentExcursion) {
          currentExcursion = {
            id: `EXC-${excursions.length + 1}`,
            startTime: r.time,
            endTime: r.time,
            parameter: param,
            direction: direction,
            peakValue: extremeVal,
            readingsCount: 1,
            durationMs: dtMs
          };
        } else {
          currentExcursion.endTime = r.time;
          currentExcursion.durationMs += dtMs;
          currentExcursion.readingsCount++;
          if (direction === "HIGH" && extremeVal > currentExcursion.peakValue) {
            currentExcursion.peakValue = extremeVal;
          } else if (direction === "LOW" && extremeVal < currentExcursion.peakValue) {
            currentExcursion.peakValue = extremeVal;
          }
        }
      } else {
        if (currentExcursion) {
          this._finalizeExcursion(currentExcursion, product, graceMs);
          excursions.push(currentExcursion);
          currentExcursion = null;
        }
      }
    }

    if (currentExcursion) {
      this._finalizeExcursion(currentExcursion, product, graceMs);
      excursions.push(currentExcursion);
    }

    let longest = null;
    const perDay = {};
    for (const exc of excursions) {
      if (!longest || exc.durationMs > longest.durationMs) longest = exc;
      const dateStr = exc.startTime.split("T")[0];
      perDay[dateStr] = (perDay[dateStr] || 0) + 1;
    }

    const tTotal = Math.max(totalMonitoredMs, 1);
    return {
      excursions,
      totalExcursions: excursions.length,
      timeInRangePct: Math.round((timeInRangeMs / tTotal) * 1000) / 10,
      timeAbovePct: Math.round((timeAboveMs / tTotal) * 1000) / 10,
      timeBelowPct: Math.round((timeBelowMs / tTotal) * 1000) / 10,
      timeInRangeMs,
      timeAboveMs,
      timeBelowMs,
      longestExcursion: longest,
      excursionsPerDay: perDay
    };
  },

  _finalizeExcursion(exc, product, graceMs) {
    const durationMin = Math.round(exc.durationMs / 60000);
    exc.durationMinutes = durationMin;
    exc.gracePeriodExceeded = exc.durationMs > graceMs;

    const { tempMin, tempMax, humMin, humMax } = product;
    let dist = 0;
    if (exc.parameter === "Temperature") {
      if (exc.direction === "HIGH") dist = exc.peakValue - tempMax;
      else dist = tempMin - exc.peakValue;
    } else {
      if (exc.direction === "HIGH") dist = exc.peakValue - (humMax || 100);
      else dist = (humMin || 0) - exc.peakValue;
    }

    if (!exc.gracePeriodExceeded) {
      exc.severity = "Minor";
      exc.severityNote = "Within allowed product grace period.";
    } else if (dist >= 3.0 || durationMin >= 60 || (exc.parameter === "Temperature" && exc.peakValue <= 0)) {
      exc.severity = "Critical";
      exc.severityNote = "Severe threshold distance or prolonged duration (possible integrity loss).";
    } else {
      exc.severity = "Major";
      exc.severityNote = "Grace period exceeded; active intervention recommended.";
    }
  },

  // Formula: ComplianceScore = 100 * (timeInRange / total) - penalty(excursions, grace violations) + completeness bonus
  calculateComplianceScore(timeInRangePct, excursions, dataCompletenessPct) {
    if (isNaN(timeInRangePct)) return 100;
    let score = timeInRangePct * 0.70;

    score += (dataCompletenessPct || 100) * 0.30;

    let minorCount = 0, majorCount = 0, criticalCount = 0, graceViolations = 0;
    for (const e of excursions || []) {
      if (e.severity === "Minor") minorCount++;
      else if (e.severity === "Major") majorCount++;
      else if (e.severity === "Critical") criticalCount++;
      if (e.gracePeriodExceeded) graceViolations++;
    }

    score -= (minorCount * 2 + majorCount * 6 + criticalCount * 15 + graceViolations * 4);
    return Math.max(0, Math.min(100, Math.round(score)));
  },

  // =========================================================================
  // 8. ANOMALY DETECTION (Z-SCORE, IQR, FLATLINE, DOOR-OPEN)
  // =========================================================================

  detectAnomalies(readings, zSensitivity = 3.0) {
    if (!readings || readings.length < 5) return [];
    const anomalies = [];
    const temps = readings.map(r => r.temp).filter(v => v !== null && !isNaN(v));
    const m = this.mean(temps);
    const s = this.stdDev(temps, m);
    const p25 = this.percentile(temps, 25);
    const p75 = this.percentile(temps, 75);
    const iqr = p75 - p25;

    for (let i = 0; i < readings.length; i++) {
      const r = readings[i];
      if (r.temp === null || isNaN(r.temp)) continue;
      const z = s > 0 ? (r.temp - m) / s : 0;

      if (Math.abs(z) > zSensitivity) {
        anomalies.push({
          type: "Z_SCORE_OUTLIER",
          time: r.time,
          value: r.temp,
          severity: "Medium",
          message: `Temperature ${r.temp}°C deviates by ${z.toFixed(2)}σ from dataset mean (${m.toFixed(1)}°C).`
        });
      }

      if (iqr > 0 && (r.temp < p25 - 1.5 * iqr || r.temp > p75 + 1.5 * iqr)) {
        anomalies.push({
          type: "IQR_OUTLIER",
          time: r.time,
          value: r.temp,
          severity: "Low",
          message: `Reading ${r.temp}°C is an IQR outlier outside [${(p25 - 1.5 * iqr).toFixed(1)}, ${(p75 + 1.5 * iqr).toFixed(1)}].`
        });
      }
    }

    for (let i = 1; i < readings.length; i++) {
      const prev = readings[i - 1];
      const curr = readings[i];
      if (prev.temp === null || curr.temp === null) continue;
      const dtMin = (new Date(curr.time) - new Date(prev.time)) / 60000;
      if (dtMin > 0 && dtMin <= 2) {
        const deltaT = Math.abs(curr.temp - prev.temp);
        if (deltaT >= 3.5) {
          anomalies.push({
            type: "SPIKE_OR_DROP",
            time: curr.time,
            value: curr.temp,
            severity: "High",
            message: `Sudden temperature shift of ${deltaT.toFixed(1)}°C in ${Math.round(dtMin * 60)} seconds.`
          });
        }
      }
    }

    let flatlineStart = 0;
    for (let i = 1; i < readings.length; i++) {
      if (readings[i].temp !== readings[flatlineStart].temp) {
        const durationMin = (new Date(readings[i - 1].time) - new Date(readings[flatlineStart].time)) / 60000;
        if (durationMin >= CONFIG.DHT11.FLATLINE_MINUTES_SUSPICIOUS) {
          anomalies.push({
            type: "FLATLINE",
            time: readings[flatlineStart].time,
            value: readings[flatlineStart].temp,
            severity: "Medium",
            message: `Temperature flatlined at exactly ${readings[flatlineStart].temp}°C for ${Math.round(durationMin)} minutes.`
          });
        }
        flatlineStart = i;
      }
    }

    for (let i = 1; i < readings.length - 2; i++) {
      const r0 = readings[i - 1];
      const r1 = readings[i];
      if (r0.temp === null || r1.temp === null) continue;
      const dt1 = (new Date(r1.time) - new Date(r0.time)) / 60000;
      if (dt1 > 0 && dt1 <= 3 && (r1.temp - r0.temp) >= 1.5) {
        for (let j = i + 1; j < Math.min(readings.length, i + 15); j++) {
          const rj = readings[j];
          if (rj.temp === null) continue;
          const totalDt = (new Date(rj.time) - new Date(r0.time)) / 60000;
          if (totalDt <= 20 && Math.abs(rj.temp - r0.temp) <= 0.8) {
            anomalies.push({
              type: "DOOR_OPEN_EVENT",
              time: r1.time,
              value: r1.temp,
              severity: "Info",
              message: `Possible refrigerator door-opening detected (rise of +${(r1.temp - r0.temp).toFixed(1)}°C recovered within ${Math.round(totalDt)} min).`
            });
            i = j;
            break;
          }
        }
      }
    }

    return anomalies;
  },

  // =========================================================================
  // 9. REGRESSION & PROJECTION
  // =========================================================================

  calculateLinearRegression(xArray, yArray) {
    const n = Math.min(xArray.length, yArray.length);
    if (n < 2) return { slope: 0, intercept: 0, r: 0, r2: 0 };

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      const x = xArray[i];
      const y = yArray[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }

    const denomM = (n * sumX2) - (sumX * sumX);
    if (denomM === 0) return { slope: 0, intercept: sumY / n, r: 0, r2: 0 };

    const slope = ((n * sumXY) - (sumX * sumY)) / denomM;
    const intercept = (sumY - (slope * sumX)) / n;

    const denomR = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));
    const r = denomR !== 0 ? ((n * sumXY) - (sumX * sumY)) / denomR : 0;

    return {
      slope: Math.round(slope * 1000) / 1000,
      intercept: Math.round(intercept * 100) / 100,
      r: Math.round(r * 1000) / 1000,
      r2: Math.round(r * r * 1000) / 1000
    };
  },

  projectTrend(recentReadings, product) {
    if (!recentReadings || recentReadings.length < 5) return null;
    const n = Math.min(recentReadings.length, 30);
    const slice = recentReadings.slice(-n);
    const t0 = new Date(slice[0].time).getTime() / 60000;
    const xs = slice.map(r => (new Date(r.time).getTime() / 60000) - t0);
    const ys = slice.map(r => r.temp);

    const reg = this.calculateLinearRegression(xs, ys);
    const currentTemp = ys[ys.length - 1];
    const slopePerMin = reg.slope;

    const proj60 = currentTemp + slopePerMin * 60;
    const proj120 = currentTemp + slopePerMin * 120;
    const proj180 = currentTemp + slopePerMin * 180;

    let breachWarning = null;
    let minutesToBreach = null;

    if (slopePerMin > 0.01 && currentTemp < product.tempMax) {
      minutesToBreach = Math.round((product.tempMax - currentTemp) / slopePerMin);
      if (minutesToBreach <= 180) {
        breachWarning = `Projected to exceed ${product.tempMax}°C limit in approx. ${minutesToBreach} minutes based on current trajectory.`;
      }
    } else if (slopePerMin < -0.01 && currentTemp > product.tempMin) {
      minutesToBreach = Math.round((currentTemp - product.tempMin) / Math.abs(slopePerMin));
      if (minutesToBreach <= 180) {
        breachWarning = `Projected to fall below ${product.tempMin}°C limit in approx. ${minutesToBreach} minutes based on cooling trajectory.`;
      }
    }

    return {
      slopePerMin: Math.round(slopePerMin * 1000) / 1000,
      slopePerHour: Math.round(slopePerMin * 60 * 100) / 100,
      proj60: Math.round(proj60 * 10) / 10,
      proj120: Math.round(proj120 * 10) / 10,
      proj180: Math.round(proj180 * 10) / 10,
      breachWarning,
      minutesToBreach
    };
  },

  // =========================================================================
  // 10. DEVICE & DATA HEALTH
  // =========================================================================

  calculateDataHealth(readings, expectedIntervalSec = 30) {
    if (!readings || readings.length === 0) {
      return {
        totalReadings: 0,
        completenessPct: 0,
        gapsCount: 0,
        gapsList: [],
        avgIntervalSec: 0,
        isOffline: false,
        lastSeenTime: null,
        sensorHealthScore: 0,
        sensorSanityWarnings: ["No data received"]
      };
    }

    const firstTime = new Date(readings[0].time).getTime();
    const lastTime = new Date(readings[readings.length - 1].time).getTime();
    const totalElapsedSec = Math.max((lastTime - firstTime) / 1000, expectedIntervalSec);
    const expectedCount = Math.floor(totalElapsedSec / expectedIntervalSec) + 1;
    const completenessPct = Math.min(100, Math.round((readings.length / expectedCount) * 1000) / 10);

    const gaps = [];
    let intervalSum = 0;
    let intervalCount = 0;
    const gapThresholdMs = expectedIntervalSec * 1000 * CONFIG.OFFLINE_THRESHOLD_MULTIPLIER; // 90s

    for (let i = 1; i < readings.length; i++) {
      const dtMs = new Date(readings[i].time).getTime() - new Date(readings[i - 1].time).getTime();
      intervalSum += dtMs / 1000;
      intervalCount++;
      if (dtMs > gapThresholdMs) {
        gaps.push({
          start: readings[i - 1].time,
          end: readings[i].time,
          durationSec: Math.round(dtMs / 1000)
        });
      }
    }

    const avgInterval = intervalCount > 0 ? Math.round((intervalSum / intervalCount) * 10) / 10 : expectedIntervalSec;

    const nowMs = Date.now();
    const lastReadingAgeSec = (nowMs - lastTime) / 1000;
    // Do not falsely flag offline if viewing historical data
    const isOffline = !isDemoMode() && lastReadingAgeSec > (expectedIntervalSec * CONFIG.OFFLINE_THRESHOLD_MULTIPLIER);

    const dht = CONFIG.DHT11;
    const sanityWarnings = [];
    let sanityScore = 100;

    for (const r of readings) {
      if (r.temp !== null && (r.temp < dht.TEMP_MIN || r.temp > dht.TEMP_MAX)) {
        sanityWarnings.push(`Reading ${r.temp}°C outside physical DHT11 boundaries (${dht.TEMP_MIN} to ${dht.TEMP_MAX}°C)`);
        sanityScore -= 10;
        break;
      }
      if (r.hum !== null && (r.hum < dht.HUM_MIN || r.hum > dht.HUM_MAX)) {
        sanityWarnings.push(`Humidity ${r.hum}% outside DHT11 boundaries (${dht.HUM_MIN} to ${dht.HUM_MAX}%)`);
        sanityScore -= 10;
        break;
      }
    }

    if (gaps.length > 5) sanityScore -= 15;
    if (completenessPct < 85) sanityScore -= 15;

    return {
      totalReadings: readings.length,
      expectedReadings: expectedCount,
      completenessPct,
      gapsCount: gaps.length,
      gapsList: gaps,
      avgIntervalSec: avgInterval,
      lastSeenTime: readings[readings.length - 1].time,
      isOffline,
      lastReadingAgeSec: Math.round(lastReadingAgeSec),
      sensorHealthScore: Math.max(0, Math.min(100, sanityScore)),
      sensorSanityWarnings: sanityWarnings
    };
  },

  // =========================================================================
  // 11. AUTOMATED SELF-TEST SUITE
  // =========================================================================

  runSelfTest() {
    const results = [];
    const assert = (testName, actual, expected, tol = 0.05) => {
      const pass = Math.abs(actual - expected) <= tol;
      results.push({ testName, actual, expected, pass });
    };

    const fixture1 = [2, 4, 4, 4, 5, 5, 7, 9];
    assert("Descriptive: Mean", this.mean(fixture1), 5.0);
    assert("Descriptive: Median", this.median(fixture1), 4.5);
    assert("Descriptive: StdDev", this.stdDev(fixture1), 2.14, 0.05);

    const constantTemps = [5.0, 5.0, 5.0, 5.0, 5.0];
    assert("MKT: Constant Temperature", this.calculateMKT(constantTemps), 5.0, 0.01);

    const fluctuatingTemps = [2.0, 8.0, 5.0, 10.0, 4.0];
    const meanFluc = this.mean(fluctuatingTemps);
    const mktFluc = this.calculateMKT(fluctuatingTemps);
    results.push({
      testName: "MKT: Exponential Weighting (> Arithmetic Mean)",
      actual: mktFluc,
      expected: `> ${meanFluc.toFixed(2)}`,
      pass: mktFluc > meanFluc
    });

    const dummyProduct = {
      tempMin: 2.0, tempMax: 8.0, humMin: 30, humMax: 60,
      gracePeriodMinutes: 5, setpoint: 5.0, hasHumidity: true
    };
    const now = new Date("2026-10-26T12:00:00Z");
    const readingsMock = [
      { time: new Date(now.getTime() + 0 * 30000).toISOString(), temp: 5.0, hum: 45 },
      { time: new Date(now.getTime() + 1 * 30000).toISOString(), temp: 9.5, hum: 45 },
      { time: new Date(now.getTime() + 2 * 30000).toISOString(), temp: 9.8, hum: 45 },
      { time: new Date(now.getTime() + 3 * 30000).toISOString(), temp: 9.2, hum: 45 },
      { time: new Date(now.getTime() + 4 * 30000).toISOString(), temp: 5.0, hum: 45 },
    ];
    const excResult = this.detectExcursions(readingsMock, dummyProduct);
    assert("Excursion Detection: Excursion Count", excResult.totalExcursions, 1, 0);
    assert("Excursion Grace Period: Not Exceeded", excResult.excursions[0]?.gracePeriodExceeded ? 1 : 0, 0, 0);

    const maTest = this.calculateTimestampMovingAverages(readingsMock, 60);
    assert("Moving Average: Timestamp Window Calculation", maTest[1], 7.25, 0.05);

    return results;
  }
};

window.Analytics = Analytics;
