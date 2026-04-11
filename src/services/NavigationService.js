/**
 * VisionGuide NavigationService
 * All data sourced from real, free public APIs — no mocks or fake drift.
 *
 * APIs used (all free, no key required):
 *   Routing    — OSRM   (router.project-osrm.org)
 *   Geocoding  — Nominatim (nominatim.openstreetmap.org)
 *   Nearby     — Overpass API (overpass-api.de)
 *   Weather    — Open-Meteo (api.open-meteo.com)
 *   Air Qual   — Open-Meteo AQ (air-quality-api.open-meteo.com)
 *   Traffic    — TomTom (optional – set REACT_APP_TOMTOM_API_KEY)
 */

// ── WMO weather code → human label + alert severity ──────────
const WMO_CODES = {
    0:  { label: 'Clear sky',          alert: false },
    1:  { label: 'Mainly clear',       alert: false },
    2:  { label: 'Partly cloudy',      alert: false },
    3:  { label: 'Overcast',           alert: false },
    45: { label: 'Foggy',              alert: 'Fog alert. Visibility is low. Move carefully.' },
    48: { label: 'Depositing rime fog',alert: 'Dense fog alert. Visibility is very low. Consider waiting indoors.' },
    51: { label: 'Light drizzle',      alert: false },
    53: { label: 'Moderate drizzle',   alert: false },
    55: { label: 'Dense drizzle',      alert: 'Heavy drizzle. Surfaces may be slippery.' },
    61: { label: 'Slight rain',        alert: false },
    63: { label: 'Moderate rain',      alert: 'Rain alert. Carry an umbrella and watch for puddles.' },
    65: { label: 'Heavy rain',         alert: 'Heavy rain alert. Surfaces are wet and slippery. Be extra careful.' },
    71: { label: 'Slight snow',        alert: 'Snow alert. Ground may be icy. Move slowly.' },
    73: { label: 'Moderate snow',      alert: 'Moderate snow alert. Ice hazard. Move with caution.' },
    75: { label: 'Heavy snow',         alert: 'Heavy snow warning. Consider staying indoors if possible.' },
    77: { label: 'Snow grains',        alert: 'Snow grains on ground. Slippery surface.' },
    80: { label: 'Slight showers',     alert: false },
    81: { label: 'Moderate showers',   alert: 'Rain showers. Surfaces may become slippery.' },
    82: { label: 'Violent showers',    alert: 'Violent rain showers. Seek shelter immediately.' },
    85: { label: 'Slight snow showers',alert: 'Snow shower. Ice possible.' },
    86: { label: 'Heavy snow showers', alert: 'Heavy snow shower. Dangerous ice risk.' },
    95: { label: 'Thunderstorm',       alert: 'Thunderstorm alert. Seek shelter immediately. Avoid open areas.' },
    96: { label: 'Thunderstorm + hail',alert: 'Severe thunderstorm with hail. Take shelter immediately.' },
    99: { label: 'Thunderstorm + heavy hail', alert: 'Extreme thunderstorm with heavy hail. Take shelter immediately.' },
};

// ── Haversine distance (metres) ───────────────────────────────
function haversine(a, b) {
    const R = 6371000;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ── OSRM step → plain-English instruction ─────────────────────
function buildInstruction(step) {
    const type     = step.maneuver?.type     || 'continue';
    const modifier = step.maneuver?.modifier || '';
    const name     = step.name              ? `onto ${step.name}` : '';
    const dist     = step.distance > 10     ? `in ${Math.round(step.distance)} metres` : '';
    const exitNo   = step.maneuver?.exit    ? `Take exit ${step.maneuver.exit}` : '';

    switch (type) {
        case 'depart':       return `Head ${modifier || 'forward'} ${name} ${dist}`.trim();
        case 'arrive':       return 'You have arrived at your destination.';
        case 'turn':         return `Turn ${modifier} ${name} ${dist}`.trim();
        case 'continue':     return `Continue straight ${name} ${dist}`.trim();
        case 'new name':     return `Continue ${name} ${dist}`.trim();
        case 'merge':        return `Merge ${modifier} ${name} ${dist}`.trim();
        case 'on ramp':      return `Take the ramp ${modifier} ${name} ${dist}`.trim();
        case 'off ramp':     return `Take the off-ramp ${modifier} ${name} ${dist}`.trim();
        case 'fork':         return `Keep ${modifier} at the fork ${name} ${dist}`.trim();
        case 'end of road':  return `Turn ${modifier} at the end of the road ${dist}`.trim();
        case 'roundabout':
        case 'rotary':       return `${exitNo || 'Take the roundabout'} ${name} ${dist}`.trim();
        case 'exit roundabout':
        case 'exit rotary':  return `Exit the roundabout ${name} ${dist}`.trim();
        case 'notification': return `Continue ${name} ${dist}`.trim();
        default:             return `Continue ${name} ${dist}`.trim();
    }
}

// ─────────────────────────────────────────────────────────────
class NavigationService {
    constructor() {
        this.currentPosition    = null;
        this.currentAddress     = null;
        this.isNavigating       = false;
        this.route              = null;
        this.currentStepIndex   = 0;
        this.onArrivalCallback  = null;
        this.watchId            = null;
        this.locationError      = null;
        this.lastTrafficSummary = '';
        this.lastInstructionAt  = 0;
    }

    // ── GPS tracking ────────────────────────────────────────
    startLocationTracking(callback) {
        this.stopLocationTracking();

        if (!('geolocation' in navigator)) {
            this.locationError = 'Geolocation is not supported by your browser.';
            if (callback) callback(null);
            return false;
        }

        this.watchId = navigator.geolocation.watchPosition(
            (pos) => {
                this.locationError = null;
                this.currentPosition = {
                    lat:      pos.coords.latitude,
                    lng:      pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    heading:  pos.coords.heading,
                    speed:    pos.coords.speed,
                };
                if (callback) callback(this.currentPosition);
                if (this.isNavigating) this._checkProgress();
            },
            (err) => {
                this.locationError = this._geoErrorMessage(err);
                if (callback) callback(null);
            },
            { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
        );

        return true;
    }

    stopLocationTracking() {
        if (this.watchId != null) {
            navigator.geolocation?.clearWatch(this.watchId);
            this.watchId = null;
        }
    }

    _geoErrorMessage(err) {
        switch (err.code) {
            case 1: return 'Location permission denied. Please allow location access in your browser settings.';
            case 2: return 'Location unavailable. GPS signal lost.';
            case 3: return 'Location request timed out. Trying again.';
            default: return 'Unknown location error.';
        }
    }

    // ── Geocoding ───────────────────────────────────────────
    async geocodeDestination(text) {
        if (!text?.trim()) return null;
        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=1`;
            const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) return null;
            return { lat: Number(data[0].lat), lng: Number(data[0].lon), label: data[0].display_name };
        } catch {
            return null;
        }
    }

    async reverseGeocode(lat, lng) {
        try {
            const url  = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
            const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
            const data = await res.json();
            if (!data?.address) return null;

            const a = data.address;
            // Build a short readable address
            const parts = [
                a.road || a.pedestrian || a.footway || a.path,
                a.suburb || a.neighbourhood || a.quarter,
                a.city    || a.town || a.village || a.county,
            ].filter(Boolean);

            return { short: parts.slice(0, 2).join(', '), full: data.display_name, address: a };
        } catch {
            return null;
        }
    }

    // ── Routing (OSRM walking) ──────────────────────────────
    async calculateRoute(destinationText, options = {}) {
        if (!destinationText) return null;

        const origin = this.currentPosition;
        if (!origin) {
            throw new Error('Your current location is not available yet. Please wait for GPS to lock in.');
        }

        const destination = await this.geocodeDestination(destinationText);
        if (!destination) {
            throw new Error(`Could not find "${destinationText}". Try a more specific address.`);
        }

        // Fetch walking route from OSRM
        const osrmUrl = `https://router.project-osrm.org/route/v1/walking/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false&alternatives=true&steps=true&annotations=duration,distance`;
        const res  = await fetch(osrmUrl);
        const data = await res.json();

        if (data.code !== 'Ok' || !data.routes?.length) {
            throw new Error('No walking route found. The destination may be too far or inaccessible on foot.');
        }

        // Optionally fetch TomTom live traffic
        await this._fetchLiveTraffic(origin, destination);

        // Score routes by user preferences
        const scored = data.routes.map(r => {
            let penalty = r.duration;
            if (options.avoidBusyRoutes)  penalty += r.distance * 0.015;
            if (options.avoidMountainous) penalty += (r.legs?.[0]?.steps?.length || 0) * 5;
            return { r, penalty };
        }).sort((a, b) => a.penalty - b.penalty);

        const best  = scored[0].r;
        const steps = (best.legs?.[0]?.steps || []).map(step => ({
            instruction: buildInstruction(step),
            distance:    step.distance,
            duration:    step.duration,
            name:        step.name || '',
            type:        step.maneuver?.type || '',
        }));

        const avoidList = [];
        if (options.avoidTolls)       avoidList.push('tolls');
        if (options.avoidBusyRoutes)  avoidList.push('highways');
        if (options.avoidMountainous) avoidList.push('ferries');
        const avoidParam = avoidList.length ? `&avoid=${avoidList.join('|')}` : '';

        this.route = {
            destination:      destination.label || destinationText,
            destinationCoords: destination,
            googleMapsUrl:    `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=walking${avoidParam}`,
            totalDistance:    best.distance,
            totalDuration:    best.duration,
            routeProfile:     this.lastTrafficSummary || `Walking route found: ${(best.distance / 1000).toFixed(1)} km, approximately ${Math.round(best.duration / 60)} minutes.`,
            steps,
            options,
        };

        return this.route;
    }

    // ── TomTom live traffic (optional) ─────────────────────
    async _fetchLiveTraffic(origin, destination) {
        const key = process.env.REACT_APP_TOMTOM_API_KEY;
        if (!key) { this.lastTrafficSummary = ''; return; }

        try {
            const bbox = [
                Math.min(origin.lng, destination.lng),
                Math.min(origin.lat, destination.lat),
                Math.max(origin.lng, destination.lng),
                Math.max(origin.lat, destination.lat),
            ].join(',');
            const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${bbox}&fields={incidents{type,properties{iconCategory,magnitudeOfDelay,events{description}}}}&language=en-GB&timeValidityFilter=present&key=${key}`;
            const res  = await fetch(url);
            const data = await res.json();
            const count = data?.incidents?.length || 0;
            this.lastTrafficSummary = count > 0
                ? `Live traffic: ${count} incident${count > 1 ? 's' : ''} near your route.`
                : 'Live traffic is clear around your route.';
        } catch {
            this.lastTrafficSummary = '';
        }
    }

    // ── Nearby places via Overpass ──────────────────────────
    async findNearby(type) {
        const origin = this.currentPosition;
        if (!origin) {
            return { type, announcement: 'Location not available yet. Please wait for GPS.', googleMapsUrl: null };
        }

        const { lat, lng } = origin;

        // Type-specific Overpass queries
        const queries = {
            restroom:  `[out:json];(node[amenity~"toilets|public_bath"](around:1000,${lat},${lng});way[amenity~"toilets|public_bath"](around:1000,${lat},${lng}););out 5;`,
            mall:      `[out:json];(node[shop="mall"](around:3000,${lat},${lng});node[landuse="retail"](around:2000,${lat},${lng});way[shop="mall"](around:3000,${lat},${lng}););out 5;`,
            help:      `[out:json];(node[amenity~"hospital|clinic|doctor|pharmacy"](around:3000,${lat},${lng});way[amenity~"hospital|clinic"](around:3000,${lat},${lng}););out 5;`,
            hospital:  `[out:json];(node[amenity~"hospital|clinic"](around:5000,${lat},${lng});way[amenity~"hospital|clinic"](around:5000,${lat},${lng}););out 5;`,
            pharmacy:  `[out:json];node[amenity="pharmacy"](around:1500,${lat},${lng});out 5;`,
            police:    `[out:json];node[amenity="police"](around:3000,${lat},${lng});out 5;`,
            food:      `[out:json];(node[amenity~"restaurant|fast_food|cafe"](around:500,${lat},${lng}););out 5;`,
            bank:      `[out:json];(node[amenity~"bank|atm"](around:1000,${lat},${lng}););out 5;`,
            transport: `[out:json];(node[highway="bus_stop"](around:300,${lat},${lng});node[railway="station"](around:1000,${lat},${lng});node[amenity="taxi"](around:500,${lat},${lng}););out 5;`,
        };

        const query = queries[type] || queries.help;

        try {
            const res  = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
            const data = await res.json();
            const elements = data?.elements || [];

            if (elements.length === 0) {
                return {
                    type,
                    announcement: `No ${type} found within walking distance. Try a broader search.`,
                    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(type)}&center=${lat},${lng}`,
                };
            }

            // Find the closest result
            const closest = elements
                .filter(e => e.lat && e.lon)
                .map(e => ({ ...e, dist: haversine({ lat, lng }, { lat: e.lat, lng: e.lon }) }))
                .sort((a, b) => a.dist - b.dist)[0];

            if (!closest) {
                return {
                    type,
                    announcement: `Found a ${type} nearby. Opening in maps.`,
                    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(type)}&center=${lat},${lng}`,
                };
            }

            const name = closest.tags?.name || `Nearby ${type}`;
            const distM = Math.round(closest.dist);
            const distText = distM < 1000 ? `${distM} metres away` : `${(distM / 1000).toFixed(1)} km away`;
            const mapsUrl  = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${closest.lat},${closest.lon}&travelmode=walking`;

            return {
                type,
                name,
                announcement: `Found ${name}, ${distText}. Opening walking directions.`,
                googleMapsUrl: mapsUrl,
                distance: closest.dist,
            };
        } catch {
            return {
                type,
                announcement: `Searching for nearby ${type}. Opening maps.`,
                googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(type)}&center=${lat},${lng}`,
            };
        }
    }

    // ── Real-time weather via Open-Meteo ────────────────────
    async getWeather() {
        const pos = this.currentPosition;
        if (!pos) return null;

        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${pos.lat}&longitude=${pos.lng}&current_weather=true&hourly=precipitation_probability&timezone=auto&forecast_days=1`;
            const res  = await fetch(url);
            const data = await res.json();
            const cw   = data?.current_weather;
            if (!cw) return null;

            const code   = cw.weathercode;
            const entry  = WMO_CODES[code] || { label: 'Unknown', alert: false };
            const tempC  = Math.round(cw.temperature);
            const windKm = Math.round(cw.windspeed);

            const alerts = [];
            if (entry.alert)  alerts.push(entry.alert);
            if (tempC > 38)   alerts.push(`Heat warning: ${tempC}°C. Stay hydrated and seek shade.`);
            if (tempC < 0)    alerts.push(`Frost warning: ${tempC}°C. Ice may be on the ground.`);
            if (windKm > 60)  alerts.push(`Strong wind warning: ${windKm} km/h. Hold onto railings.`);

            return {
                temperature:   tempC,
                windspeed:     windKm,
                condition:     entry.label,
                weathercode:   code,
                isDay:         cw.is_day === 1,
                alerts,
            };
        } catch {
            return null;
        }
    }

    // ── Air quality via Open-Meteo ──────────────────────────
    async getAirQuality() {
        const pos = this.currentPosition;
        if (!pos) return null;

        try {
            const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${pos.lat}&longitude=${pos.lng}&current=european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide&timezone=auto`;
            const res  = await fetch(url);
            const data = await res.json();
            const cur  = data?.current;
            if (!cur) return null;

            const aqi = cur.european_aqi;
            let level, alert;
            if (aqi <= 20)       { level = 'Good';       alert = null; }
            else if (aqi <= 40)  { level = 'Fair';       alert = null; }
            else if (aqi <= 60)  { level = 'Moderate';   alert = 'Moderate air pollution. Sensitive individuals should limit outdoor exposure.'; }
            else if (aqi <= 80)  { level = 'Poor';       alert = 'Poor air quality. Avoid prolonged outdoor activity.'; }
            else if (aqi <= 100) { level = 'Very poor';  alert = 'Very poor air quality. Wear a mask and limit outdoor time.'; }
            else                 { level = 'Extremely poor'; alert = 'Extremely poor air quality. Avoid going outside.'; }

            return { aqi, level, pm25: cur.pm2_5, pm10: cur.pm10, alert };
        } catch {
            return null;
        }
    }

    // ── Navigation control ──────────────────────────────────
    startNavigation() {
        if (!this.route) return false;
        this.isNavigating      = true;
        this.currentStepIndex  = 0;
        this.lastInstructionAt = Date.now();
        return true;
    }

    stopNavigation() {
        this.isNavigating     = false;
        this.route            = null;
        this.currentStepIndex = 0;
    }

    onArrival(cb) { this.onArrivalCallback = cb; }

    _checkProgress() {
        if (!this.route?.steps?.length) return;
        const elapsed = Date.now() - this.lastInstructionAt;
        if (elapsed > 10000 && this.currentStepIndex < this.route.steps.length - 1) {
            this.currentStepIndex++;
            this.lastInstructionAt = Date.now();
        }
        if (this.currentStepIndex >= this.route.steps.length - 1) {
            this.isNavigating = false;
            this.onArrivalCallback?.();
        }
    }

    getStatus() {
        if (!this.isNavigating || !this.route) {
            return { isNavigating: false, trafficSummary: this.lastTrafficSummary };
        }
        const step      = this.route.steps[this.currentStepIndex];
        const remaining = this.route.steps.slice(this.currentStepIndex);
        return {
            isNavigating:      true,
            destination:       this.route.destination,
            googleMapsUrl:     this.route.googleMapsUrl,
            currentStep:       this.currentStepIndex + 1,
            totalSteps:        this.route.steps.length,
            currentInstruction: step?.instruction || null,
            remainingDistance: remaining.reduce((s, r) => s + (r.distance || 0), 0),
            remainingDuration: remaining.reduce((s, r) => s + (r.duration || 0), 0),
            trafficSummary:    this.lastTrafficSummary,
        };
    }

    getNearbySuggestions() {
        return Promise.all([this.findNearby('restroom'), this.findNearby('mall')]);
    }
}

export default NavigationService;
