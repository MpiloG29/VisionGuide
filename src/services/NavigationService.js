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

    async findNearby(type) {
        const origin = this.currentPosition || this.defaultCity;
        const amenityMap = { restroom: 'toilets', mall: 'mall', help: 'hospital' };
        const amenity = amenityMap[type] || 'toilets';

        try {
            const overpassQuery = `[out:json];(node[amenity=${amenity}](around:1500,${origin.lat},${origin.lng});node[shop=mall](around:3000,${origin.lat},${origin.lng}););out 10;`;
            const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`);
            const data = await response.json();
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
