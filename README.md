# CoolChain: Cold Chain Environmental Monitoring & Analytics

**CoolChain** is an end-to-end IoT environmental monitoring and compliance platform designed for cold chain storage logistics (e.g., vaccines, biologics, blood, dairy, meats, and fresh produce). The system combines an **ESP32 microcontroller + DHT11 sensor** node with a modern, zero-backend, client-side analytics web dashboard ready for instant hosting on **GitHub Pages**.

---

## 🏗 System Architecture

```text
  [ DHT11 Sensor ] ──(GPIO 4: Temp, RH)──> [ ESP32 DevKit ]
                                                  │
                                                  ▼ (WiFi HTTP GET /update every 30s)
                                       [ ThingSpeak IoT Cloud ]
                                                  │
                                                  ▼ (REST JSON Feeds API)
                                    [ CoolChain Web Dashboard ]
                                    (Static SPA on GitHub Pages)
```

1. **Hardware Node**: An ESP32 reads ambient temperature and relative humidity from a DHT11 sensor every 5 seconds, computes a 12-sample moving average, evaluates fixed hardware thresholds (2–8 °C, 30–70% RH), and periodically publishes telemetry to ThingSpeak every 30 seconds.
2. **Cloud Bridge**: ThingSpeak channels store multi-field telemetry records.
3. **Analytics Dashboard**: A pure static web application (HTML5/CSS3/Vanilla ES6+ JS) that fetches raw telemetry, **recalculates all thresholds and deviations dynamically based on the currently selected product profile**, computes regulatory quality metrics (Haynes Mean Kinetic Temperature, Shewhart SPC, Q10 freshness shelf-life degradation), and generates auditor-ready reports.

---

## 🚀 Quick Start: Web Dashboard Setup

### 1. Connecting Your ThingSpeak Channel
The website is completely pre-configured. To connect your live ESP32 device, edit **only one file**:

Open [`js/config.js`](file:///d:/arduino_codes/js/config.js):

```javascript
const CONFIG = {
  // Replace with your numeric ThingSpeak Channel ID:
  CHANNEL_ID: "YOUR_CHANNEL_ID",      // e.g. "2741920"

  // Replace with your 16-character ThingSpeak READ API Key:
  READ_API_KEY: "YOUR_READ_API_KEY",  // e.g. "ABC123XYZ456DEF7"
  
  REFRESH_SECONDS: 30,                // Browser auto-refresh interval
  DEVICE_INTERVAL_SECONDS: 30,         // Telemetry publication rate
  DEFAULT_PRODUCT: "vaccines",         // Initial selected product
};
```

> [!CAUTION]
> **Security Notice**:
> - Only enter your **READ API Key** in `js/config.js`.
> - **NEVER** place your **Write API Key**, WiFi passwords, or private account keys in `config.js` or any client-side file.
> - The Read API Key is visible to web visitors; keep your ThingSpeak write key strictly on the ESP32 firmware.

### 2. Demo Mode
If `CHANNEL_ID` is left as `"YOUR_CHANNEL_ID"` or empty, CoolChain automatically activates **Demo Mode**. In Demo Mode, realistic simulated DHT11 telemetry (with 1°C steps, excursions, diurnal cycling, and simulated sensor gaps) is generated client-side, allowing you to explore all features, product profiles, and reports without needing active hardware.

---

## 🌐 Deploying to GitHub Pages (Free Hosting)

CoolChain requires **zero build steps** and no server backend. It runs directly on GitHub Pages.

### Option A: Standard Branch Deployment (Recommended)
1. Initialize a Git repository and push this directory to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial CoolChain release"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
2. In your GitHub repository, navigate to **Settings** > **Pages** (under "Code and automation").
3. Under **Build and deployment** > **Source**, select **Deploy from a branch**.
4. Set the branch to `main` and folder to `/(root)`.
5. Click **Save**. Your dashboard will be live at `https://<your-username>.github.io/<your-repo-name>/` in 1–2 minutes!

### Option B: Automated GitHub Actions
An automated deployment workflow is already included in [`.github/workflows/pages.yml`](file:///d:/arduino_codes/.github/workflows/pages.yml). Under **Settings** > **Pages**, simply choose **GitHub Actions** as the source, and every push to `main` will build and publish automatically.

---

## 💻 Local Testing

You can run CoolChain locally in any modern browser:

### Using Python:
```bash
# In the project directory:
python -m http.server 8000
```
Then visit `http://localhost:8000` in your web browser.

### Direct File Execution:
You can also directly double-click [`index.html`](file:///d:/arduino_codes/index.html). The application contains built-in fallback catalogs and CORS-safe polling to operate even over the `file://` protocol.

---

## 📦 Dynamic Product Profiles & Batches

Unlike basic monitors with hardcoded limits, CoolChain evaluates conditions dynamically per product:

- **15 Standard Presets**: Vaccines, Insulin & Biologics, Whole Blood, Fresh Dairy, Fresh Meat, Fresh Fish, Table Eggs, Leafy Greens, Berries, Apples, Tomatoes, Bananas, Chocolate, CRT Medicines, and Frozen Foods.
- **Product Parameters**: Min/Max Temperature, Min/Max Humidity, Ideal Setpoint, Warning Pre-alert Margin, Excursion Grace Period, Base Shelf Life, and Arrhenius $Q_{10}$ Factor.
- **Custom Profiles**: Full CRUD support (create, duplicate, edit, delete, reset to defaults). Export and import profiles as JSON.
- **Batch Tracking**: Log consignment batches with lot numbers and start/end times. Filter analytics, excursions, and reports by active batch.
- **Storage Suitability Matrix**: A live matrix across all catalog profiles answering: *"Given the environmental conditions recorded over this period, which products could have been safely stored here?"*

---

## 🔬 Scientific & Regulatory Analytics

CoolChain calculates compliance metrics on the client side:

1. **Haynes Mean Kinetic Temperature (MKT)**:
   $$T_{\text{k}} = \frac{\frac{\Delta H}{R}}{-\ln \left( \frac{1}{n} \sum_{i=1}^{n} e^{-\frac{\Delta H}{R \cdot T_i}} \right)}$$
   Uses $\Delta H = 83.144\text{ kJ/mol}$ (standard activation energy for pharmaceutical stability) and $R = 0.0083144\text{ kJ/(mol}\cdot\text{K)}$.
2. **$Q_{10}$ Freshness & Shelf-Life Kinetic Model**:
   $$\text{Aging Multiplier} = Q_{10}^{\frac{T - T_{\text{setpoint}}}{10}}$$
   Integrates degradation rate across time steps to calculate shelf-life days consumed, remaining days, and excess life lost during excursions.
3. **Statistical Process Control (SPC)**:
   Shewhart control chart tracking mean, $\pm 1\sigma$, $\pm 2\sigma$, and $\pm 3\sigma$ control boundaries to flag instability before catastrophic spoilage occurs.
4. **Magnus–Tetens Dew Point**:
   Calculates surface condensation and moisture risk.
5. **Sensor Uncertainty Guard Bands**:
   Accounting for DHT11 physical accuracy ($\pm 2.0^\circ\text{C}, \pm 5.0\%\text{ RH}$), readings within the guard band of a limit are treated as *"Uncertain / Warning"* to prevent false-compliance certification.
6. **Hardware Health & Anomaly Engine**:
   Detects Z-score outliers, sudden spikes, flatlining ($>60$ min constant readings), and refrigerator door-open signatures.

---

## 🔌 Hardware Node Pinout & Telemetry

### Wiring Configuration
| Sensor / Peripheral | ESP32 GPIO | Description |
| :--- | :--- | :--- |
| **DHT11 Data** | `GPIO 4` | Temperature & humidity sensing |
| **Active Buzzer** | `GPIO 18` | Audible alarm on threshold breach |
| **Alert LED** | `GPIO 2` | Onboard or external visual breach indicator |
| **Power Rails** | `3.3V / 5V` & `GND` | Common ground and VCC supply |

### ThingSpeak Field Mapping
- **`field1`**: Raw Temperature ($^\circ\text{C}$)
- **`field2`**: Raw Humidity ($\%$)
- **`field3`**: On-device 12-sample Rolling Average ($^\circ\text{C}$)
- **`field4`**: On-device Deviation from 5.0°C ($^\circ\text{C}$)
- **`field5`**: On-device Fixed-Limit Alarm flag ($0$ or $1$)

*Note: The web dashboard displays `field5` as an independent "Device Alarm" and automatically alerts you if the device's fixed limits disagree with your selected product profile.*

---

## 👥 Project Credits

- **Ch. Marthanda Teja** (CSE-B)
- **A. Hari Eshan Reddy** (CSE-B)
