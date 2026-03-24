/**
 * Object Detection Service using TensorFlow.js with COCO-SSD model
 * Detects obstacles in real-time from camera feed
 */

class ObjectDetectionService {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.detectionInterval = null;
        this.onDetectionCallback = null;
        this.lastAlertTime = 0;
        this.alertCooldown = 3000; // 3 seconds between alerts
        this.detectedObjects = [];
        
        // Obstacle types that are dangerous
        this.hazardousObjects = [
            'person', 'car', 'truck', 'bus', 'motorcycle', 'bicycle',
            'traffic light', 'stop sign', 'fire hydrant', 'bench',
            'chair', 'potted plant', 'bed', 'toilet', 'tv',
            'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
            'book', 'clock', 'vase', 'scissors', 'teddy bear',
            'hair drier', 'toothbrush'
        ];
        
        // Priority objects (most dangerous)
        this.priorityObjects = ['person', 'car', 'truck', 'bus', 'motorcycle'];
    }

    /**
     * Load the COCO-SSD model
     */
    async loadModel() {
        try {
            console.log('Loading COCO-SSD model...');
            this.model = await cocoSsd.load();
            this.isModelLoaded = true;
            console.log('Model loaded successfully!');
            return true;
        } catch (error) {
            console.error('Failed to load model:', error);
            return false;
        }
    }

    /**
     * Start real-time detection from video stream
     */
    startDetection(videoElement, callback) {
        if (!this.isModelLoaded) {
            console.error('Model not loaded yet');
            return false;
        }
        
        this.onDetectionCallback = callback;
        
        // Run detection every 500ms (2 FPS for performance)
        this.detectionInterval = setInterval(async () => {
            if (videoElement && videoElement.videoWidth > 0) {
                await this.detectObjects(videoElement);
            }
        }, 500);
        
        return true;
    }

    /**
     * Stop detection
     */
    stopDetection() {
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }
    }

    /**
     * Detect objects in the video frame
     */
    async detectObjects(videoElement) {
        try {
            // Run detection
            const predictions = await this.model.detect(videoElement);
            
            // Filter for hazardous objects
            const hazardousDetections = predictions.filter(pred => 
                this.hazardousObjects.includes(pred.class)
            );
            
            this.detectedObjects = hazardousDetections;
            
            // Generate alerts for hazardous objects
            this.generateAlerts(hazardousDetections, videoElement.videoWidth);
            
            // Callback with detection results
            if (this.onDetectionCallback) {
                this.onDetectionCallback(hazardousDetections);
            }
            
            return hazardousDetections;
        } catch (error) {
            console.error('Detection error:', error);
            return [];
        }
    }

    /**
     * Generate voice alerts for detected obstacles
     */
    generateAlerts(detections, screenWidth) {
        const now = Date.now();
        
        // Check each detection
        for (const detection of detections) {
            // Calculate position on screen
            const xCenter = (detection.bbox[0] + detection.bbox[2]) / 2;
            const screenPercentage = (xCenter / screenWidth) * 100;
            
            // Determine direction
            let direction = '';
            if (screenPercentage < 30) direction = 'left';
            else if (screenPercentage > 70) direction = 'right';
            else direction = 'center';
            
            // Calculate distance based on bounding box size
            const boxSize = detection.bbox[2] * detection.bbox[3];
            let distance = 'unknown';
            if (boxSize > 150000) distance = 'very close';
            else if (boxSize > 80000) distance = 'close';
            else if (boxSize > 30000) distance = 'moderate';
            else distance = 'far';
            
            // Priority objects get alerts
            const isPriority = this.priorityObjects.includes(detection.class);
            const confidence = Math.round(detection.score * 100);
            
            // Only alert if confidence is high enough
            if (confidence > 60 && (isPriority || distance === 'very close')) {
                const alertKey = ${detection.class}_;
                
                // Cooldown check
                if (now - this.lastAlertTime > this.alertCooldown) {
                    this.speakAlert(detection.class, direction, distance, confidence);
                    this.lastAlertTime = now;
                    break; // Only alert for one object at a time
                }
            }
        }
    }

    /**
     * Speak alert using Web Speech API
     */
    speakAlert(className, direction, distance, confidence) {
        if (!('speechSynthesis' in window)) {
            console.warn('Speech synthesis not supported');
            return;
        }
        
        // Create alert message
        let message = '';
        
        if (distance === 'very close') {
            message = Warning!   very close!;
        } else if (distance === 'close') {
            message = Caution:  on your ;
        } else if (className === 'car' || className === 'person') {
            message = ${className} detected ;
        } else {
            message = Obstacle:  ;
        }
        
        // Add distance information
        if (distance !== 'unknown' && distance !== 'far') {
            message += , ;
        }
        
        // Speak with urgency
        const utterance = new SpeechSynthesisUtterance(message);
        
        // Adjust voice based on urgency
        if (distance === 'very close') {
            utterance.rate = 1.2;
            utterance.pitch = 1.2;
        } else {
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
        }
        
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        
        console.log('Alert:', message);
    }

    /**
     * Get current detections
     */
    getDetections() {
        return this.detectedObjects;
    }

    /**
     * Check if model is loaded
     */
    isReady() {
        return this.isModelLoaded;
    }
}

export default ObjectDetectionService;
