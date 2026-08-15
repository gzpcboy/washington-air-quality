# Washington Air Quality

A minimal, full-screen map of current air-quality readings and official AQI contour areas across Washington State. It uses Leaflet, OpenStreetMap tiles, Washington State Department of Ecology station data, and EPA AirNow contours.

## Data source

The site queries Ecology's [`AirQualityMonitoringHourlyResults` layer](https://gis.ecology.wa.gov/serverext/rest/services/AQ/AirQualityMonitoringHourlyResults/MapServer/0), which provides hourly telemetry concentrations and calculated AQI values. The implementation requests the two newest hourly batches, keeps the latest record for each station, and refreshes once per hour to match the source cadence. Fetching two batches avoids a brief empty-map window while Ecology rolls the service over to a new hour.

Readings older than three hours or implausibly dated in the future are not shown as current. Missing AQI values appear as gray markers. The official ArcGIS service allows cross-origin browser requests, so no backend proxy is required.

## AQI layer

Before implementing interpolation, the available official services were checked. Ecology's current [`AQ` ArcGIS folder](https://gis.ecology.wa.gov/serverext/rest/services/AQ) exposes hourly monitoring points but no current AQI surface. EPA AirNow does publish a usable official [`AirNowLatestContoursCombined` layer](https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/AirNowLatestContoursCombined/FeatureServer/0), so the site uses that layer instead of generating its own interpolation.

The AirNow layer is queried only for the Washington bounding area and refreshed hourly. Features older than three hours are rejected. AirNow publishes AQI category bands rather than exact interpolated values, so clicking the surface shows an **Estimated AQI** range, category, update time, source, and an explicit notice that the result is not a measurement. Clicking an Ecology station continues to show its actual measured AQI and station details.

The compact layer control provides:

- **AQI Layer** visibility, enabled by default
- AQI layer opacity from 50% to 65%
- **Monitoring Stations** visibility, enabled by default

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
- Current AQI contours: U.S. EPA AirNow
- Map rendering: Leaflet 1.9.4
- Basemap: OpenStreetMap contributors
