# Washington Air Quality

A minimal, full-screen map of current air-quality readings from monitoring stations across Washington State. It uses Leaflet, OpenStreetMap tiles, and the Washington State Department of Ecology's official hourly ArcGIS service.

## Data source

The site queries Ecology's [`AirQualityMonitoringHourlyResults` layer](https://gis.ecology.wa.gov/serverext/rest/services/AQ/AirQualityMonitoringHourlyResults/MapServer/0), which provides hourly telemetry concentrations and calculated AQI values. The implementation requests the latest (`HourPriorToLatest = 0`) record for each station and refreshes once per hour to match the source cadence.

Readings older than three hours or implausibly dated in the future are not shown as current. Missing AQI values appear as gray markers. The official ArcGIS service allows cross-origin browser requests, so no backend proxy is required.

## Run locally

The site must be served over HTTP (rather than opened as a `file://` URL) so browser APIs behave normally.

With Python 3:

```bash
cd washington-air-quality
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

With Node.js instead:

```bash
cd washington-air-quality
npx serve .
```

Geolocation works on `localhost` and on HTTPS deployments. Your browser will ask for permission the first time you select **My Location**.

## Deploy with GitHub Pages

This repository is configured to publish directly from the default branch:

1. On GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Choose the `main` branch and `/ (root)`, then save.
4. GitHub will publish the site at `https://YOUR-USERNAME.github.io/washington-air-quality/`.

No environment variables, build command, account, or server is needed.

## Other static hosts

Cloudflare Pages, Netlify, and Vercel can also deploy the repository as a static site. Use the repository root as the output directory and leave the build command empty.

## Technology and attribution

- Live air-quality data: Washington State Department of Ecology
- Map rendering: Leaflet 1.9.4
- Basemap: OpenStreetMap contributors
