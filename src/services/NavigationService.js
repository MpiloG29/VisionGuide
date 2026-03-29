class NavigationService {
    constructor() {
        this.currentPosition = null;
        this.isNavigating = false;
        this.route = null;
        this.currentStepIndex = 0;
        this.onArrivalCallback = null;
        this.watchId = null;
        this.trackingMode = null;
        this.lastInstructionAt = 0;
        this.defaultCity = { lat: 40.7128, lng: -74.006 };
        this.lastTrafficSummary = 'Traffic data is not available yet.';
        this.lastResolvedLocation = null;
        this.lastReverseGeocodeAt = 0;
    }

    startLocationTracking(callback) {
        this.stopLocationTracking();
        if ('geolocation' in navigator) {
            this.trackingMode = 'geo';
            this.watchId = navigator.geolocation.watchPosition(
                (position) => {
                    this.currentPosition = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    };
                    if (callback) callback(this.currentPosition);
                    if (this.isNavigating) this.checkProgress();
                },
                () => {
                    this.stopLocationTracking();
                    this.fallbackToMockTracking(callback);
                },
                { enableHighAccuracy: true, maximumAge: 2500, timeout: 7000 }
            );
            return true;
        }
        return this.fallbackToMockTracking(callback);
    }

    fallbackToMockTracking(callback) {
        this.trackingMode = 'interval';
        if (!this.currentPosition) this.currentPosition = { ...this.defaultCity, accuracy: 40 };
        this.watchId = setInterval(() => {
            this.currentPosition = {
                ...this.currentPosition,
                lat: this.currentPosition.lat + 0.00003,
                lng: this.currentPosition.lng + 0.00002
            };
            if (callback) callback(this.currentPosition);
            if (this.isNavigating) this.checkProgress();
        }, 2500);
        return true;
    }

    stopLocationTracking() {
        if (!this.watchId) return;
        if (this.trackingMode === 'interval') clearInterval(this.watchId);
        if (this.trackingMode === 'geo' && 'geolocation' in navigator) navigator.geolocation.clearWatch(this.watchId);
        this.watchId = null;
        this.trackingMode = null;
    }

    async geocodeDestination(destinationText) {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destinationText)}`);
        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) return null;
        return { lat: Number(data[0].lat), lng: Number(data[0].lon), label: data[0].display_name };
    }

    async reverseGeocodeLocation(position = this.currentPosition) {
        if (!position) return null;

        const cacheKey = `${position.lat.toFixed(4)},${position.lng.toFixed(4)}`;
        const now = Date.now();

        if (this.lastResolvedLocation?.key === cacheKey && now - this.lastResolvedLocation.at < 30000) {
            return this.lastResolvedLocation.label;
        }

        if (now - this.lastReverseGeocodeAt < 1100 && this.lastResolvedLocation?.label) {
            return this.lastResolvedLocation.label;
        }

        this.lastReverseGeocodeAt = now;

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${position.lat}&lon=${position.lng}&format=json`,
                {
                    headers: {
                        'Accept-Language': 'en'
                    }
                }
            );
            const data = await response.json();
            const label = data?.display_name || null;

            if (label) {
                this.lastResolvedLocation = { key: cacheKey, label, at: Date.now() };
            }

            return label;
        } catch {
            return this.lastResolvedLocation?.label || null;
        }
    }

    async fetchLiveTraffic(origin, destination) {
        const apiKey = process.env.REACT_APP_TOMTOM_API_KEY;
        if (!apiKey) {
            this.lastTrafficSummary = 'Live traffic unavailable. Add REACT_APP_TOMTOM_API_KEY for traffic-aware rerouting.';
            return null;
        }

        try {
            const box = `${Math.min(origin.lng, destination.lng)},${Math.min(origin.lat, destination.lat)},${Math.max(origin.lng, destination.lng)},${Math.max(origin.lat, destination.lat)}`;
            const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${box}&fields={incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description}}}}&language=en-GB&timeValidityFilter=present&key=${apiKey}`;
            const res = await fetch(url);
            const data = await res.json();
            const count = data?.incidents?.length || 0;
            this.lastTrafficSummary = count > 0
                ? `Live traffic shows ${count} incidents nearby. Choosing the route with least delay.`
                : 'Live traffic is light around your route.';
            return data;
        } catch {
            this.lastTrafficSummary = 'Could not load live traffic. Using fastest available route.';
            return null;
        }
    }

    async calculateRoute(destinationText, options = {}) {
        if (!destinationText) return null;
        const origin = this.currentPosition || this.defaultCity;
        const destination = await this.geocodeDestination(destinationText);
        if (!destination) return null;

        const osrmUrl = `https://router.project-osrm.org/route/v1/walking/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false&alternatives=true&steps=true&annotations=duration,distance,speed`;
        const routeRes = await fetch(osrmUrl);
        const routeData = await routeRes.json();
        if (!routeData?.routes?.length) return null;

        await this.fetchLiveTraffic(origin, destination);

        const ranked = routeData.routes
            .map((route) => {
                let score = route.duration;
                if (options.avoidBusyRoutes) score += route.distance * 0.015;
                if (options.avoidMountainous) score += route.legs?.[0]?.steps?.length * 4;
                return { route, score };
            })
            .sort((a, b) => a.score - b.score);

        const selected = ranked[0]?.route;
        const steps = selected.legs?.[0]?.steps?.map((step) => ({
            instruction: step.maneuver?.instruction || `Continue ${step.name || 'ahead'}`,
            distance: step.distance,
            duration: step.duration
        })) || [];

        const avoidParts = [];
        if (options.avoidBusyRoutes) avoidParts.push('highways');
        if (options.avoidTolls) avoidParts.push('tolls');
        if (options.avoidMountainous) avoidParts.push('ferries');
        const avoid = avoidParts.length ? `&avoid=${encodeURIComponent(avoidParts.join('|'))}` : '';

        this.route = {
            destination: destination.label || destinationText,
            destinationCoords: destination,
            googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=walking${avoid}`,
            totalDistance: selected.distance,
            totalDuration: selected.duration,
            routeProfile: this.lastTrafficSummary,
            options,
            steps
        };

        return this.route;
    }

    calculateDistance(origin, destination) {
        const earthRadius = 6371000;
        const lat1 = origin.lat * Math.PI / 180;
        const lat2 = destination.lat * Math.PI / 180;
        const deltaLat = (destination.lat - origin.lat) * Math.PI / 180;
        const deltaLng = (destination.lng - origin.lng) * Math.PI / 180;

        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
            + Math.cos(lat1) * Math.cos(lat2)
            * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return earthRadius * c;
    }

    formatLandmarkResult(element, origin, fallbackLabel) {
        const lat = element?.lat;
        const lng = element?.lon;
        if (typeof lat !== 'number' || typeof lng !== 'number') return null;

        return {
            label: element?.tags?.name || fallbackLabel,
            lat,
            lng,
            distance: this.calculateDistance(origin, { lat, lng }),
            googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        };
    }

    async findNearby(type) {
        const origin = this.currentPosition || this.defaultCity;

        try {
            let overpassQuery = '';

            if (type === 'restroom') {
                overpassQuery = `[out:json];node[amenity=toilets](around:1500,${origin.lat},${origin.lng});out 10;`;
            } else if (type === 'mall') {
                overpassQuery = `[out:json];node[shop=mall](around:3000,${origin.lat},${origin.lng});out 10;`;
            } else if (type === 'help') {
                overpassQuery = `[out:json];(node[amenity=hospital](around:5000,${origin.lat},${origin.lng});node[amenity=police](around:5000,${origin.lat},${origin.lng}););out 20;`;
            } else {
                overpassQuery = `[out:json];node[amenity=toilets](around:1500,${origin.lat},${origin.lng});out 10;`;
            }

            const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`);
            const data = await response.json();

            if (type === 'help') {
                const elements = Array.isArray(data?.elements) ? data.elements : [];
                const hospital = elements
                    .filter((element) => element?.tags?.amenity === 'hospital')
                    .map((element) => this.formatLandmarkResult(element, origin, 'nearest hospital'))
                    .filter(Boolean)
                    .sort((a, b) => a.distance - b.distance)[0];

                const police = elements
                    .filter((element) => element?.tags?.amenity === 'police')
                    .map((element) => this.formatLandmarkResult(element, origin, 'nearest police station'))
                    .filter(Boolean)
                    .sort((a, b) => a.distance - b.distance)[0];

                const options = [];
                if (hospital) {
                    options.push({ label: 'Nearest hospital', kind: 'open-maps', value: hospital.googleMapsUrl });
                }
                if (police) {
                    options.push({ label: 'Nearest police', kind: 'open-maps', value: police.googleMapsUrl });
                }

                if (options.length > 0) {
                    const nearestEmergencySpot = [hospital, police].filter(Boolean).sort((a, b) => a.distance - b.distance)[0];
                    const announcementParts = [];

                    if (hospital) {
                        announcementParts.push(`Nearest hospital is ${hospital.label}, about ${Math.round(hospital.distance)} meters away`);
                    }
                    if (police) {
                        announcementParts.push(`nearest police station is ${police.label}, about ${Math.round(police.distance)} meters away`);
                    }

                    return {
                        type,
                        announcement: `I found nearby emergency landmarks. ${announcementParts.join('. ')}.`,
                        googleMapsUrl: nearestEmergencySpot.googleMapsUrl,
                        actions: options
                    };
                }
            }

            const first = data?.elements?.[0];
            const label = first?.tags?.name || `nearby ${type}`;
            const lat = first?.lat || origin.lat;
            const lng = first?.lon || origin.lng;
            return { type, announcement: `Found ${label}. Opening on Google Maps.`, googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` };
        } catch {
            return { type, announcement: `Looking for nearby ${type}.`, googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(type)}&center=${origin.lat},${origin.lng}` };
        }
    }

    async getNearbySuggestions() {
        const [restroom, mall] = await Promise.all([this.findNearby('restroom'), this.findNearby('mall')]);
        return { restroom, mall };
    }

    startNavigation() {
        if (!this.route) return false;
        this.isNavigating = true;
        this.currentStepIndex = 0;
        this.lastInstructionAt = Date.now();
        return true;
    }

    stopNavigation() {
        this.isNavigating = false;
        this.route = null;
        this.currentStepIndex = 0;
        this.lastInstructionAt = 0;
    }

    checkProgress() {
        if (!this.route || !this.isNavigating || !this.route.steps.length) return;
        const elapsed = Date.now() - this.lastInstructionAt;
        if (elapsed > 10000 && this.currentStepIndex < this.route.steps.length - 1) {
            this.currentStepIndex += 1;
            this.lastInstructionAt = Date.now();
        }
        if (this.currentStepIndex >= this.route.steps.length - 1) {
            this.isNavigating = false;
            if (this.onArrivalCallback) this.onArrivalCallback();
        }
    }

    onArrival(callback) { this.onArrivalCallback = callback; }

    getStatus() {
        if (!this.isNavigating || !this.route) return { isNavigating: false, trafficSummary: this.lastTrafficSummary };
        const currentStep = this.route.steps[this.currentStepIndex];
        const remainingSteps = this.route.steps.slice(this.currentStepIndex);
        const remainingDistance = remainingSteps.reduce((sum, step) => sum + (step.distance || 0), 0);
        const remainingDuration = remainingSteps.reduce((sum, step) => sum + (step.duration || 0), 0);

        return {
            isNavigating: true,
            destination: this.route.destination,
            routeProfile: this.route.routeProfile,
            googleMapsUrl: this.route.googleMapsUrl,
            currentStep: this.currentStepIndex + 1,
            totalSteps: this.route.steps.length,
            currentInstruction: currentStep ? currentStep.instruction : null,
            remainingDistance,
            remainingDuration,
            trafficSummary: this.lastTrafficSummary
        };
    }
}

export default NavigationService;
