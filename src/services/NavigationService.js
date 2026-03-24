/**
 * Simplified Navigation Service for demo purposes
 * Uses mock data for the hackathon
 */

class NavigationService {
    constructor() {
        this.currentPosition = { lat: -33.9249, lng: 18.4241 }; // Cape Town
        this.isNavigating = false;
        this.route = null;
        this.currentStepIndex = 0;
        this.onArrivalCallback = null;
        this.watchId = null;
        this.onLocationUpdateCallback = null;
        
        // Mock route steps
        this.mockRoute = {
            steps: [
                { instruction: "Walk straight for 100 meters", distance: 100, duration: 60 },
                { instruction: "Turn left at the intersection", distance: 50, duration: 30 },
                { instruction: "Continue straight to the bus stop", distance: 200, duration: 120 },
                { instruction: "You have arrived at your destination", distance: 0, duration: 0 }
            ],
            totalDistance: 350,
            totalDuration: 210
        };
    }

    startLocationTracking(callback) {
        this.onLocationUpdateCallback = callback;
        
        // Simulate location updates
        this.watchId = setInterval(() => {
            // Simulate moving slightly
            this.currentPosition.lat += 0.0001;
            this.currentPosition.lng += 0.0001;
            
            if (callback) {
                callback(this.currentPosition);
            }
            
            if (this.isNavigating) {
                this.checkProgress();
            }
        }, 2000);
        
        return true;
    }

    stopLocationTracking() {
        if (this.watchId) {
            clearInterval(this.watchId);
            this.watchId = null;
        }
    }

    async calculateRoute(destination) {
        // Mock route calculation
        return new Promise((resolve) => {
            setTimeout(() => {
                this.route = this.mockRoute;
                resolve(this.route);
            }, 500);
        });
    }

    startNavigation() {
        if (!this.route) {
            this.route = this.mockRoute;
        }
        this.isNavigating = true;
        this.currentStepIndex = 0;
        return true;
    }

    stopNavigation() {
        this.isNavigating = false;
        this.route = null;
        this.currentStepIndex = 0;
    }

    checkProgress() {
        if (!this.route || !this.isNavigating) return;
        
        // Simulate progressing through steps
        if (this.currentStepIndex < this.route.steps.length - 1) {
            // Random chance to advance to next step (simulating movement)
            if (Math.random() < 0.3) {
                this.currentStepIndex++;
            }
        } else if (this.currentStepIndex === this.route.steps.length - 1) {
            // Arrived at destination
            if (this.onArrivalCallback) {
                this.onArrivalCallback();
            }
            this.isNavigating = false;
        }
    }

    onArrival(callback) {
        this.onArrivalCallback = callback;
    }

    getStatus() {
        if (!this.isNavigating || !this.route) {
            return { isNavigating: false };
        }
        
        const currentStep = this.route.steps[this.currentStepIndex];
        const remainingSteps = this.route.steps.slice(this.currentStepIndex);
        const remainingDistance = remainingSteps.reduce((sum, step) => sum + step.distance, 0);
        const remainingDuration = remainingSteps.reduce((sum, step) => sum + step.duration, 0);
        
        return {
            isNavigating: true,
            currentStep: this.currentStepIndex + 1,
            totalSteps: this.route.steps.length,
            currentInstruction: currentStep ? currentStep.instruction : null,
            remainingDistance: remainingDistance,
            remainingDuration: remainingDuration
        };
    }
}

export default NavigationService;
