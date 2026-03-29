import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

const VEHICLE_OBJECTS = ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train'];
const DANGEROUS_OBJECTS = {
    person: { severity: 'high', label: 'person' },
    car: { severity: 'critical', label: 'car' },
    truck: { severity: 'critical', label: 'truck' },
    bus: { severity: 'critical', label: 'bus' },
    motorcycle: { severity: 'critical', label: 'motorcycle' },
    bicycle: { severity: 'high', label: 'bicycle' },
    train: { severity: 'critical', label: 'train' },
    traffic_light: { severity: 'critical', label: 'traffic light' },
    stop_sign: { severity: 'high', label: 'stop sign' },
    fire_hydrant: { severity: 'medium', label: 'fire hydrant' },
    bench: { severity: 'medium', label: 'bench' },
    chair: { severity: 'medium', label: 'chair' },
    couch: { severity: 'medium', label: 'couch' },
    potted_plant: { severity: 'medium', label: 'potted plant' },
    suitcase: { severity: 'medium', label: 'suitcase' },
    backpack: { severity: 'medium', label: 'backpack' },
    handbag: { severity: 'medium', label: 'handbag' },
    dog: { severity: 'high', label: 'dog' },
    cat: { severity: 'medium', label: 'cat' }
};

const HAZARDOUS_OBJECTS = Object.values(DANGEROUS_OBJECTS).map((item) => item.label);
const PRIORITY_OBJECTS = HAZARDOUS_OBJECTS.filter((label) => ['critical', 'high'].includes(
    Object.values(DANGEROUS_OBJECTS).find((item) => item.label === label)?.severity
));

const CameraView = ({ onDetection, onAlert }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const modelRef = useRef(null);
    const animationRef = useRef(null);
    const analysisCanvasRef = useRef(null);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isModelReady, setIsModelReady] = useState(false);
    const [detections, setDetections] = useState([]);
    const [error, setError] = useState(null);
    const [fps, setFps] = useState(0);

    const lastAlertTime = useRef(0);
    const frameCount = useRef(0);
    const lastFpsUpdate = useRef(Date.now());
    const lastBoxSizes = useRef(new Map());
    const trafficSignalState = useRef('unknown');

    useEffect(() => {
        analysisCanvasRef.current = document.createElement('canvas');
        initCamera();
        loadModel();

        return () => {
            if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, []);

    useEffect(() => {
        if (!isCameraActive || !isModelReady || animationRef.current) return;
        startDetectionLoop();
    }, [isCameraActive, isModelReady]);

    const initCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current.play();
                    setIsCameraActive(true);
                };
            }
        } catch (err) {
            setError('Unable to access camera. Please check permissions.');
        }
    };

    const loadModel = async () => {
        try {
            await tf.ready();
            modelRef.current = await cocoSsd.load();
            setIsModelReady(true);
        } catch (err) {
            setError('Failed to load AI model. Please refresh.');
        }
    };

    const getDirection = (bbox, videoWidth) => {
        const xCenter = bbox[0] + bbox[2] / 2;
        const ratio = xCenter / videoWidth;
        if (ratio < 0.33) return 'left';
        if (ratio > 0.66) return 'right';
        return 'center';
    };

    const estimateTrafficLightSignal = (bbox) => {
        if (!videoRef.current || !analysisCanvasRef.current) return 'unknown';
        const [x, y, w, h] = bbox;
        const canvas = analysisCanvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return 'unknown';

        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        const columns = [0.3, 0.5, 0.7];
        const rows = [0.2, 0.5, 0.8];
        let redScore = 0;
        let greenScore = 0;
        let amberScore = 0;

        rows.forEach((rowRatio) => {
            columns.forEach((columnRatio) => {
                const sampleX = Math.max(0, Math.min(canvas.width - 1, Math.round(x + w * columnRatio)));
                const sampleY = Math.max(0, Math.min(canvas.height - 1, Math.round(y + h * rowRatio)));
                const pixel = ctx.getImageData(sampleX, sampleY, 1, 1)?.data;
                if (!pixel) return;

                const [r, g, b] = pixel;
                if (r > 140 && r > g + 35 && r > b + 35) redScore += 1;
                else if (g > 120 && g > r + 25 && g > b + 15) greenScore += 1;
                else if (r > 140 && g > 100 && b < 120) amberScore += 1;
            });
        });

        if (redScore >= 2 && redScore >= greenScore) return 'red';
        if (greenScore >= 2 && greenScore > redScore) return 'green';
        if (amberScore >= 2) return 'amber';
        return 'unknown';
    };

    const getHazardMeta = (className) => Object.values(DANGEROUS_OBJECTS).find((item) => item.label === className) || null;

    const triggerDangerVibration = (strength = 'medium') => {
        if (!('vibrate' in navigator)) return;
        if (strength === 'high') navigator.vibrate([250, 120, 250, 120, 300]);
        else navigator.vibrate([120, 50, 120]);
    };

    const generateAlerts = useCallback((allDetections) => {
        const now = Date.now();
        if (now - lastAlertTime.current < 2500) return;

        const videoWidth = videoRef.current?.videoWidth || 640;
        const videoHeight = videoRef.current?.videoHeight || 480;

        const hazardous = allDetections.filter((d) => HAZARDOUS_OBJECTS.includes(d.class));
        const trafficLight = allDetections.find((d) => d.class === 'traffic light');

        if (trafficLight) {
            const signal = estimateTrafficLightSignal(trafficLight.bbox);
            if (signal !== 'unknown' && signal !== trafficSignalState.current) {
                const lightMsg = signal === 'red'
                    ? 'Traffic robot is red. Please wait before crossing.'
                    : signal === 'green'
                        ? 'Traffic robot is green. Cross only if safe.'
                        : 'Traffic robot is amber. Be ready to stop.';
                if (onAlert) onAlert(lightMsg);
                trafficSignalState.current = signal;
                lastAlertTime.current = now;
                return;
            }
        }

        if (hazardous.length === 0) return;

        const rankedHazards = hazardous.sort((a, b) => {
            const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
            const metaA = getHazardMeta(a.class);
            const metaB = getHazardMeta(b.class);
            const scoreA = severityWeight[metaA?.severity || 'low'];
            const scoreB = severityWeight[metaB?.severity || 'low'];
            if (scoreA !== scoreB) return scoreB - scoreA;
            return b.score - a.score;
        });

        const top = rankedHazards[0];
        const direction = getDirection(top.bbox, videoWidth);
        const boxArea = top.bbox[2] * top.bbox[3];
        const ratio = boxArea / (videoWidth * videoHeight);
        const id = `${top.class}-${direction}`;
        const previousArea = lastBoxSizes.current.get(id) || 0;
        const isApproaching = previousArea > 0 && boxArea > previousArea * 1.18;
        lastBoxSizes.current.set(id, boxArea);

        const hazardMeta = getHazardMeta(top.class);
        const nearVehicle = VEHICLE_OBJECTS.includes(top.class) && (ratio > 0.16 || isApproaching);
        const veryClose = ratio > 0.2;
        const urgency = veryClose || nearVehicle || hazardMeta?.severity === 'critical' ? 'high' : 'medium';

        let message = `${top.class} detected on your ${direction}. Stay alert.`;
        if (nearVehicle) {
            message = `${top.class} coming closer on your ${direction}. Move to a safer side.`;
        } else if (top.class === 'person' && (veryClose || isApproaching)) {
            message = `Person very close on your ${direction}. Move carefully.`;
        } else if (['bench', 'chair', 'couch', 'suitcase', 'backpack', 'handbag', 'potted plant', 'fire hydrant'].includes(top.class)) {
            message = `Obstacle ahead on your ${direction}: ${top.class}. Watch your step.`;
        } else if (top.class === 'dog') {
            message = `Dog detected on your ${direction}. Stay cautious.`;
        } else if (top.class === 'stop sign') {
            message = 'Stop sign detected ahead. Slow down and check your crossing.';
        }

        if (onAlert) onAlert(message);
        triggerDangerVibration(urgency);
        lastAlertTime.current = now;
    }, [onAlert]);

    const updateFpsCounter = () => {
        frameCount.current += 1;
        const now = Date.now();
        if (now - lastFpsUpdate.current >= 1000) {
            setFps(frameCount.current);
            frameCount.current = 0;
            lastFpsUpdate.current = now;
        }
    };

    const startDetectionLoop = () => {
        const detect = async () => {
            if (videoRef.current && modelRef.current && videoRef.current.videoWidth > 0) {
                try {
                    const predictions = await modelRef.current.detect(videoRef.current);
                    const relevant = predictions.filter((p) => {
                        if (PRIORITY_OBJECTS.includes(p.class)) return p.score > 0.38;
                        if (p.class === 'traffic light') return p.score > 0.32;
                        return HAZARDOUS_OBJECTS.includes(p.class) && p.score > 0.45;
                    });
                    setDetections(relevant);
                    if (onDetection) onDetection(relevant);
                    generateAlerts(relevant);
                    updateFpsCounter();
                } catch (err) {
                    // no-op
                }
            }
            animationRef.current = requestAnimationFrame(detect);
        };
        animationRef.current = requestAnimationFrame(detect);
    };

    useEffect(() => {
        if (!canvasRef.current || !videoRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const draw = () => {
            if (!videoRef.current) return;
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            detections.forEach((det) => {
                const [x, y, w, h] = det.bbox;
                const conf = Math.round(det.score * 100);
                let color = '#d4d4d4';
                const meta = getHazardMeta(det.class);
                if (det.class === 'traffic light') {
                    const signal = estimateTrafficLightSignal(det.bbox);
                    color = signal === 'red' ? '#ff4d4f' : signal === 'green' ? '#52c41a' : signal === 'amber' ? '#faad14' : '#bfbfbf';
                } else if (meta?.severity === 'critical') color = '#ff4d4f';
                else if (meta?.severity === 'high') color = '#faad14';
                else if (meta?.severity === 'medium') color = '#40a9ff';

                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, w, h);
                const trafficSuffix = det.class === 'traffic light'
                    ? ` ${estimateTrafficLightSignal(det.bbox)}`
                    : '';
                const label = `${det.class}${trafficSuffix} ${conf}%`;
                const textWidth = ctx.measureText(label).width;
                ctx.fillStyle = color;
                ctx.fillRect(x, y - 24, textWidth + 12, 24);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 14px Arial';
                ctx.fillText(label, x + 6, y - 7);
            });

            requestAnimationFrame(draw);
        };

        draw();
    }, [detections]);

    return (
        <div className="relative w-full h-full bg-black">
            {error && <div className="absolute top-4 left-4 right-4 bg-neutral-900 text-white border border-white p-3 rounded z-10">{error}</div>}

            {!isModelReady && isCameraActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 z-10">
                    <div className="text-white text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
                        <p>Loading AI model... {fps > 0 ? 'Ready' : 'Please wait'}</p>
                    </div>
                </div>
            )}

            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
            />

            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

            {isModelReady && (
                <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white px-3 py-1 rounded text-sm">
                    AI Active | {fps} FPS
                </div>
            )}
        </div>
    );
};

export default CameraView;
