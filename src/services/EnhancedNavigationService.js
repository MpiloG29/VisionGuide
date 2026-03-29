/**
 * Enhanced Navigation Service
 * Google Maps integration with route preferences for visually impaired users
 */

class EnhancedNavigationService {
    constructor() {
        this.currentPosition = null;
        this.destination = null;
        this.currentRoute = null;
        this.routePreferences = {
            avoidHills: true,
            avoidBusyRoads: true,
            preferWideSidewalks: true,
            preferWellLit: true
        };
        this.isNavigating = false;
        this.currentStepIndex = 0;
        this.watchId = null;
        this.onLocationUpdate = null;
        this.onStepChange = null;
        this.onArrival = null;
        this.onHazardAlert = null;
        this.vibrationEnabled = true;
        
        // Google Maps API key - user needs to provide their own
        this.googleMapsApiKey = null;
        this.directionsService = null;
        this.directionsRenderer = null;
        
        // Place search for amenities
        this.placesService = null;
    }
    
    /**
     * Initialize Google Maps services
     */
    initializeMaps(apiKey) {
        this.googleMapsApiKey = apiKey;
        
        // Load Google Maps script dynamically
        return new Promise((resolve, reject) => {
            if (window.google && window.google.maps) {
                this.initMapServices();
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,directions`;
            script.async = true;
            script.defer = true;
            script.onload = () => {
                this.initMapServices();
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    initMapServices() {
        this.directionsService = new google.maps.DirectionsService();
        this.directionsRenderer = new google.maps.DirectionsRenderer();
        this.placesService = new google.maps.places.PlacesService(document.createElement('div'));
    }
    
    /**
     * Set route preferences for visually impaired users
     */
    setRoutePreferences(preferences) {
        this.routePreferences = { ...this.routePreferences, ...preferences };
    }
    
    /**
     * Get current location with high accuracy
     */
    getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject('Geolocation not supported');
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.currentPosition = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        heading: position.coords.heading || 0
                    };
                    resolve(this.currentPosition);
                },
                (error) => {
                    reject(error.message);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }
    
    /**
     * Calculate route with preferences for visually impaired
     */
    async calculateRoute(destination, voiceDestinationText = null) {
        if (!this.currentPosition) {
            await this.getCurrentLocation();
        }
        
        let destinationLocation;
        
        // Handle voice input for destination
        if (typeof destination === 'string') {
            // Geocode the destination using Google Places
            destinationLocation = await this.geocodeAddress(destination);
            if (!destinationLocation) {
                throw new Error('Could not find destination');
            }
        } else {
            destinationLocation = destination;
        }
        
        this.destination = destinationLocation;
        this.voiceDestinationInput = voiceDestinationText;
        
        // Build travel mode options with preferences
        const travelMode = google.maps.TravelMode.WALKING;
        
        const request = {
            origin: this.currentPosition,
            destination: destinationLocation,
            travelMode: travelMode,
            provideRouteAlternatives: true,
            unitSystem: google.maps.UnitSystem.METRIC
        };
        
        // Add avoid options based on preferences
        if (this.routePreferences.avoidHills) {
            request.avoidHighways = true; // Approximates avoiding hills in walking
        }
        
        if (this.routePreferences.avoidBusyRoads) {
            request.avoidTolls = true;
        }
        
        return new Promise((resolve, reject) => {
            this.directionsService.route(request, (result, status) => {
                if (status === 'OK') {
                    // Filter routes based on preferences
                    let routes = result.routes;
                    
                    // Score and select best route for visually impaired
                    const scoredRoutes = routes.map(route => ({
                        route: route,
                        score: this.scoreRouteAccessibility(route)
                    }));
                    
                    scoredRoutes.sort((a, b) => b.score - a.score);
                    this.currentRoute = scoredRoutes[0].route;
                    
                    // Parse route into voice-friendly steps
                    this.routeSteps = this.parseRouteToSteps(this.currentRoute);
                    this.currentStepIndex = 0;
                    
                    resolve({
                        route: this.currentRoute,
                        steps: this.routeSteps,
                        totalDistance: this.currentRoute.legs[0].distance.text,
                        totalDuration: this.currentRoute.legs[0].duration.text,
                        accessibleScore: scoredRoutes[0].score
                    });
                } else {
                    reject(new Error('Route calculation failed: ' + status));
                }
            });
        });
    }
    
    /**
     * Score route accessibility for visually impaired users
     */
    scoreRouteAccessibility(route) {
        let score = 100;
        const leg = route.legs[0];
        
        // Check for steps (stairs) - reduce score if found
        if (leg.steps) {
            leg.steps.forEach(step => {
                const instruction = step.instructions.toLowerCase();
                if (instruction.includes('stairs') || instruction.includes('steps')) {
                    score -= 15;
                }
                if (instruction.includes('cross') && instruction.includes('street')) {
                    // Crossings are good but need caution - neutral
                }
                if (instruction.includes('bridge') || instruction.includes('tunnel')) {
                    score -= 10;
                }
            });
        }
        
        // Longer routes get slightly lower scores
        const distanceInMeters = leg.distance.value;
        if (distanceInMeters > 2000) score -= 10;
        if (distanceInMeters > 5000) score -= 15;
        
        return Math.max(score, 0);
    }
    
    /**
     * Parse Google Maps route into voice-friendly navigation steps
     */
    parseRouteToSteps(route) {
        const steps = [];
        let stepNumber = 1;
        
        route.legs.forEach(leg => {
            leg.steps.forEach(step => {
                const instruction = this.simplifyInstruction(step.instructions);
                steps.push({
                    number: stepNumber++,
                    instruction: instruction,
                    distance: step.distance.text,
                    duration: step.duration.text,
                    location: step.end_location,
                    rawInstruction: step.instructions
                });
            });
        });
        
        return steps;
    }
    
    /**
     * Simplify Google Maps instructions for voice clarity
     */
    simplifyInstruction(instruction) {
        // Remove HTML tags
        let simplified = instruction.replace(/<[^>]*>/g, ' ');
        
        // Simplify common phrases
        simplified = simplified
            .replace(/Head\s+(north|south|east|west)/i, 'Go')
            .replace(/Turn\s+left/i, 'Left turn')
            .replace(/Turn\s+right/i, 'Right turn')
            .replace(/Continue\s+straight/i, 'Go straight')
            .replace(/Destination\s+will\s+be\s+on\s+the\s+(\w+)/i, 'Destination will be on your ')
            .replace(/ slight /i, ' ')
            .replace(/sharp /i, '')
            .replace(/toward\s+/, 'towards ');
        
        return simplified.trim();
    }
    
    /**
     * Geocode address using Google Places
     */
    geocodeAddress(address) {
        return new Promise((resolve, reject) => {
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ address: address }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    resolve({
                        lat: results[0].geometry.location.lat(),
                        lng: results[0].geometry.location.lng(),
                        formattedAddress: results[0].formatted_address
                    });
                } else {
                    reject('Address not found');
                }
            });
        });
    }
    
    /**
     * Start navigation with step-by-step guidance
     */
    startNavigation() {
        if (!this.currentRoute || this.routeSteps.length === 0) {
            console.error('No route calculated');
            return false;
        }
        
        this.isNavigating = true;
        this.currentStepIndex = 0;
        this.speakStep(this.routeSteps[0]);
        
        return true;
    }
    
    /**
     * Speak a navigation step with enhanced instructions
     */
    speakStep(step) {
        if (!step) return;
        
        let message = step.instruction;
        
        // Add distance information
        if (step.distance) {
            message += `, in ${step.distance}`;
        }
        
        // Add caution if crossing roads
        if (step.instruction.toLowerCase().includes('cross')) {
            message += '. Listen for traffic before crossing.';
        }
        
        this.speakMessage(message);
        
        if (this.onStepChange) {
            this.onStepChange(step);
        }
    }
    
    /**
     * Speak message using Web Speech API
     */
    speakMessage(message) {
        if (!('speechSynthesis' in window)) return;
        
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }
    
    /**
     * Start location tracking with hazard detection
     */
    startLocationTracking(callback, hazardCallback) {
        this.onLocationUpdate = callback;
        this.onHazardAlert = hazardCallback;
        
        if (!navigator.geolocation) {
            console.error('Geolocation not supported');
            return false;
        }
        
        this.watchId = navigator.geolocation.watchPosition(
            (position) => {
                const newPosition = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    heading: position.coords.heading || 0,
                    speed: position.coords.speed || 0,
                    accuracy: position.coords.accuracy
                };
                
                this.currentPosition = newPosition;
                
                if (callback) callback(newPosition);
                
                if (this.isNavigating && this.currentRoute) {
                    this.checkProgress();
                }
                
                // Check for nearby hazards based on speed and proximity
                this.checkForHazards(newPosition);
            },
            (error) => {
                console.error('Location error:', error);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 1000,
                timeout: 5000
            }
        );
        
        return true;
    }
    
    /**
     * Check for potential hazards based on location and movement
     */
    checkForHazards(position) {
        // High speed while walking could indicate being in a vehicle
        if (position.speed > 2.5) { // ~9 km/h, faster than typical walking
            this.triggerHazardAlert(
                'vehicle',
                'Detected high speed movement. You may be in or near a vehicle.',
                'critical'
            );
            this.triggerVibration('critical');
        }
        
        // Low accuracy could indicate indoor or GPS-denied area
        if (position.accuracy > 50) {
            this.triggerHazardAlert(
                'low_accuracy',
                'GPS signal weak. Please be cautious of your surroundings.',
                'warning'
            );
        }
    }
    
    /**
     * Trigger hazard alert with voice and optional vibration
     */
    triggerHazardAlert(type, message, severity) {
        if (this.onHazardAlert) {
            this.onHazardAlert(type, message, severity);
        }
        
        this.speakMessage(message);
        
        if (this.vibrationEnabled && severity === 'critical') {
            this.triggerVibration(severity);
        }
    }
    
    /**
     * Trigger vibration pattern based on severity
     */
    triggerVibration(severity) {
        if (!('vibrate' in navigator)) return;
        
        switch(severity) {
            case 'critical':
                navigator.vibrate([500, 200, 500]);
                break;
            case 'warning':
                navigator.vibrate([300]);
                break;
            case 'info':
                navigator.vibrate([100]);
                break;
            default:
                navigator.vibrate([200]);
        }
    }
    
    /**
     * Check progress along route and announce next steps
     */
    checkProgress() {
        if (!this.currentPosition || !this.currentRoute) return;
        
        const currentStep = this.routeSteps[this.currentStepIndex];
        if (!currentStep) return;
        
        // Calculate distance to next step location
        const stepLocation = currentStep.location;
        const distance = this.calculateDistance(
            this.currentPosition,
            { lat: stepLocation.lat(), lng: stepLocation.lng() }
        );
        
        // If within 30 meters of step, move to next instruction
        if (distance < 30 && this.currentStepIndex < this.routeSteps.length - 1) {
            this.currentStepIndex++;
            const nextStep = this.routeSteps[this.currentStepIndex];
            this.speakStep(nextStep);
        }
        
        // Check if arrived at destination
        const destDistance = this.calculateDistance(
            this.currentPosition,
            this.destination
        );
        
        if (destDistance < 20) {
            this.handleArrival();
        }
    }
    
    /**
     * Calculate distance between two points in meters
     */
    calculateDistance(point1, point2) {
        const R = 6371000;
        const lat1 = point1.lat * Math.PI / 180;
        const lat2 = point2.lat * Math.PI / 180;
        const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
        const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;
        
        const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        return R * c;
    }
    
    /**
     * Handle arrival at destination
     */
    handleArrival() {
        this.isNavigating = false;
        this.speakMessage('You have arrived at your destination. Safe travels!');
        
        if (this.onArrival) {
            this.onArrival();
        }
    }
    
    /**
     * Stop navigation
     */
    stopNavigation() {
        this.isNavigating = false;
        this.currentRoute = null;
        this.routeSteps = [];
        this.currentStepIndex = 0;
    }
    
    /**
     * Stop location tracking
     */
    stopLocationTracking() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }
    
    /**
     * Search for nearby amenities (restrooms, malls, etc.)
     */
    searchNearby(type, radius = 500) {
        if (!this.placesService || !this.currentPosition) {
            return Promise.reject('Places service not ready or location unavailable');
        }
        
        const request = {
            location: new google.maps.LatLng(this.currentPosition.lat, this.currentPosition.lng),
            radius: radius,
            type: type
        };
        
        return new Promise((resolve, reject) => {
            this.placesService.nearbySearch(request, (results, status) => {
                if (status === 'OK') {
                    const places = results.map(place => ({
                        name: place.name,
                        address: place.vicinity,
                        location: {
                            lat: place.geometry.location.lat(),
                            lng: place.geometry.location.lng()
                        },
                        distance: this.calculateDistance(
                            this.currentPosition,
                            {
                                lat: place.geometry.location.lat(),
                                lng: place.geometry.location.lng()
                            }
                        ),
                        types: place.types
                    }));
                    resolve(places);
                } else {
                    reject(`Place search failed: ${status}`);
                }
            });
        });
    }
    
    /**
     * Find nearest restroom
     */
    findNearestRestroom() {
        return this.searchNearby('restroom', 1000).then(places => {
            if (places.length > 0) {
                places.sort((a, b) => a.distance - b.distance);
                return places[0];
            }
            return null;
        });
    }
    
    /**
     * Find nearest shopping mall
     */
    findNearestMall() {
        return this.searchNearby('shopping_mall', 2000).then(places => {
            if (places.length > 0) {
                places.sort((a, b) => a.distance - b.distance);
                return places[0];
            }
            return null;
        });
    }
    
    /**
     * Get current navigation status
     */
    getStatus() {
        if (!this.isNavigating || !this.routeSteps) {
            return { isNavigating: false };
        }
        
        const currentStep = this.routeSteps[this.currentStepIndex];
        const remainingSteps = this.routeSteps.slice(this.currentStepIndex);
        
        return {
            isNavigating: true,
            currentStepNumber: this.currentStepIndex + 1,
            totalSteps: this.routeSteps.length,
            currentInstruction: currentStep ? currentStep.instruction : null,
            remainingSteps: remainingSteps.length,
            destination: this.voiceDestinationInput || 'destination'
        };
    }
    
    /**
     * Enable or disable vibration
     */
    setVibrationEnabled(enabled) {
        this.vibrationEnabled = enabled;
    }
}

export default EnhancedNavigationService;
