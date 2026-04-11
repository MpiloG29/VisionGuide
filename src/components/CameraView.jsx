import { useRef, useEffect, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

// ── Hazard definitions with severity ──────────────────────────
const HAZARD_MAP = {
    car:           { severity: 'critical', label: 'car'           },
    truck:         { severity: 'critical', label: 'truck'         },
    bus:           { severity: 'critical', label: 'bus'           },
    motorcycle:    { severity: 'critical', label: 'motorcycle'    },
    train:         { severity: 'critical', label: 'train'         },
    traffic_light: { severity: 'critical', label: 'traffic light' },
    person:        { severity: 'high',     label: 'person'        },
    bicycle:       { severity: 'high',     label: 'bicycle'       },
    stop_sign:     { severity: 'high',     label: 'stop sign'     },
    dog:           { severity: 'high',     label: 'dog'           },
    fire_hydrant:  { severity: 'medium',   label: 'fire hydrant'  },
    bench:         { severity: 'medium',   label: 'bench'         },
    chair:         { severity: 'medium',   label: 'chair'         },
    couch:         { severity: 'medium',   label: 'couch'         },
    potted_plant:  { severity: 'medium',   label: 'potted plant'  },
    suitcase:      { severity: 'medium',   label: 'suitcase'      },
    backpack:      { severity: 'medium',   label: 'backpack'      },
    handbag:       { severity: 'medium',   label: 'handbag'       },
    cat:           { severity: 'medium',   label: 'cat'           },
};

const VEHICLE_CLASSES = new Set(['car','truck','bus','motorcycle','bicycle','train']);
const HAZARD_CLASSES   = new Set(Object.values(HAZARD_MAP).map(h => h.label));
const PRIORITY_CLASSES = new Set(
    Object.values(HAZARD_MAP).filter(h => h.severity === 'critical' || h.severity === 'high').map(h => h.label)
);

// ── Score thresholds (indoor mode relaxes them slightly) ──────
const THRESHOLD = {
    requested:  0.20,
    priority:   0.38,
    traffic:    0.30,
    hazard:     0.42,
    default:    0.55,
};
const THRESHOLD_INDOOR = {
    requested:  0.18,
    priority:   0.32,
    traffic:    0.25,
    hazard:     0.35,
    default:    0.45,
};

// ── Context scenario detector ─────────────────────────────────
function detectScenario(objects) {
    const cls = objects.map(o => o.class);
    const count = (c) => cls.filter(x => x === c).length;
    const has   = (...items) => items.some(i => cls.includes(i));

    if (has('traffic light') && has('person', 'car', 'bus', 'truck')) return { id: 'crosswalk', label: 'Crosswalk', icon: '🚦', color: '#5b8fff' };
    if (count('person') >= 4)                                          return { id: 'crowd',     label: 'Crowded Area', icon: '👥', color: '#ff7a59' };
    if (has('car','truck','bus') && count('car') + count('bus') >= 2) return { id: 'road',      label: 'Busy Road',    icon: '🚗', color: '#ff3b55' };
    if (has('dining table','cup','bottle','bowl'))                     return { id: 'kitchen',   label: 'Dining Area',  icon: '🍽️', color: '#00cc88' };
    if (has('dog'))                                                    return { id: 'pet',       label: 'Animal Nearby', icon: '🐕', color: '#ffbb35' };
    if (has('bicycle'))                                                return { id: 'cycle',     label: 'Cyclist',      icon: '🚲', color: '#ffbb35' };
    if (has('stop sign'))                                              return { id: 'stop',      label: 'Stop Sign',    icon: '🛑', color: '#ff3b55' };
    if (has('bench'))                                                  return { id: 'outdoor',   label: 'Outdoor Area', icon: '🌳', color: '#00cc88' };
    if (has('suitcase','backpack','handbag') && has('person'))         return { id: 'shop',      label: 'Shopping Area', icon: '🛍️', color: '#9f7aea' };
    if (has('chair') && count('chair') >= 2)                          return { id: 'office',    label: 'Office / Waiting Area', icon: '💼', color: '#5b8fff' };
    return null;
}

// ── Box colours ───────────────────────────────────────────────
function getBoxColor(det, requestedItem, trafficSignal) {
    const isTarget = requestedItem && det.class.toLowerCase().includes(requestedItem.toLowerCase());
    if (isTarget)                          return '#9f7aea';
    if (det.class === 'traffic light') {
        if (trafficSignal === 'red')   return '#ff3b55';
        if (trafficSignal === 'green') return '#00cc88';
        if (trafficSignal === 'amber') return '#ffbb35';
        return '#8895b3';
    }
    const meta = HAZARD_MAP[Object.keys(HAZARD_MAP).find(k => HAZARD_MAP[k].label === det.class)];
    if (meta?.severity === 'critical') return '#ff3b55';
    if (meta?.severity === 'high')     return '#ffbb35';
    if (meta?.severity === 'medium')   return '#5b8fff';
    return '#8895b3';
}

// ── Alert message builder ─────────────────────────────────────
function buildAlertMessage(det, direction, isApproaching, ratio, scenario) {
    const cls = det.class;
    if (cls === 'traffic light') return null; // handled separately

    const veryClose   = ratio > 0.22;
    const nearVehicle = VEHICLE_CLASSES.has(cls) && (ratio > 0.15 || isApproaching);

    if (nearVehicle)     return `${cls} coming closer on your ${direction}. Move to a safer side immediately.`;
    if (cls === 'person' && veryClose) return `Person very close on your ${direction}. Move carefully.`;
    if (cls === 'dog')   return `Dog detected on your ${direction}. Stay cautious.`;
    if (cls === 'stop sign') return 'Stop sign ahead. Slow down and check your surroundings.';
    if (['bench','chair','suitcase','backpack','handbag','fire hydrant','potted plant'].includes(cls))
        return `Obstacle on your ${direction}: ${cls}. Watch your step.`;

    if (scenario?.id === 'crosswalk') return `Crosswalk ahead on your ${direction}. Wait for the green signal.`;
    if (scenario?.id === 'crowd')     return `Crowded area detected. Move slowly and stay aware.`;

    return `${cls} on your ${direction}. Stay alert.`;
}

// ─────────────────────────────────────────────────────────────
const CameraView = ({ onDetection, onAlert, requestedItem, hapticEnabled = true, indoorMode = false }) => {
    const videoRef        = useRef(null);
    const canvasRef       = useRef(null);
    const streamRef       = useRef(null);
    const modelRef        = useRef(null);
    const animationRef    = useRef(null);
    const analysisCanvas  = useRef(document.createElement('canvas'));

    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isModelReady,   setIsModelReady]   = useState(false);
    const [detections,     setDetections]     = useState([]);
    const [error,          setError]          = useState(null);
    const [fps,            setFps]            = useState(0);
    const [currentScenario, setCurrentScenario] = useState(null);

    const lastAlertTime      = useRef(0);
    const frameCount         = useRef(0);
    const lastFpsUpdate      = useRef(Date.now());
    const lastBoxSizes       = useRef(new Map());
    const trafficSignalState = useRef('unknown');

    // ── Camera init ───────────────────────────────────────────
    const initCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current.play();
                    setIsCameraActive(true);
                };
            }
        } catch {
            setError('Camera access denied. Please allow camera permissions and refresh.');
        }
    }, []);

    // ── Model init ────────────────────────────────────────────
    const loadModel = useCallback(async () => {
        try {
            await tf.ready();
            modelRef.current = await cocoSsd.load();
            setIsModelReady(true);
        } catch {
            setError('AI model failed to load. Please refresh the page.');
        }
    }, []);

    useEffect(() => {
        initCamera();
        loadModel();
        return () => {
            streamRef.current?.getTracks().forEach(t => t.stop());
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [initCamera, loadModel]);

    useEffect(() => {
        if (!isCameraActive || !isModelReady || animationRef.current) return;
        startDetectionLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCameraActive, isModelReady]);

    // ── Traffic light signal estimation ──────────────────────
    const estimateTrafficSignal = (bbox) => {
        const video = videoRef.current;
        const canvas = analysisCanvas.current;
        if (!video || !canvas) return 'unknown';

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return 'unknown';

        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const [x, y, w, h] = bbox;
        let red = 0, green = 0, amber = 0;

        [[0.3,0.2],[0.5,0.2],[0.7,0.2],[0.5,0.5],[0.3,0.8],[0.5,0.8],[0.7,0.8]].forEach(([cr, rr]) => {
            const sx = Math.max(0, Math.min(canvas.width  - 1, Math.round(x + w * cr)));
            const sy = Math.max(0, Math.min(canvas.height - 1, Math.round(y + h * rr)));
            const px = ctx.getImageData(sx, sy, 1, 1)?.data;
            if (!px) return;
            const [r, g, b] = px;
            if (r > 140 && r > g + 40 && r > b + 40) red++;
            else if (g > 120 && g > r + 25 && g > b + 15) green++;
            else if (r > 140 && g > 100 && b < 120) amber++;
        });

        if (red >= 2 && red >= green) return 'red';
        if (green >= 2 && green > red) return 'green';
        if (amber >= 2) return 'amber';
        return 'unknown';
    };

    // ── Alert generation ──────────────────────────────────────
    const generateAlerts = useCallback((allDetections) => {
        const now = Date.now();
        if (now - lastAlertTime.current < 2800) return;

        const videoW = videoRef.current?.videoWidth  || 640;
        const videoH = videoRef.current?.videoHeight || 480;

        // Traffic light check first
        const trafficLight = allDetections.find(d => d.class === 'traffic light');
        if (trafficLight) {
            const signal = estimateTrafficSignal(trafficLight.bbox);
            if (signal !== 'unknown' && signal !== trafficSignalState.current) {
                const msg = signal === 'red'   ? 'Traffic light is red. Please wait before crossing.'
                          : signal === 'green' ? 'Traffic light is green. Cross carefully if safe.'
                          :                     'Traffic light is amber. Be ready to stop.';
                trafficSignalState.current = signal;
                if (onAlert) onAlert(msg);
                if (hapticEnabled && 'vibrate' in navigator) {
                    navigator.vibrate(signal === 'red' ? [300, 100, 300] : [100]);
                }
                lastAlertTime.current = now;
                return;
            }
        }

        const scenario = detectScenario(allDetections);
        const hazardous = allDetections.filter(d => HAZARD_CLASSES.has(d.class));
        if (hazardous.length === 0) return;

        const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
        const ranked = [...hazardous].sort((a, b) => {
            const ma = HAZARD_MAP[Object.keys(HAZARD_MAP).find(k => HAZARD_MAP[k].label === a.class)];
            const mb = HAZARD_MAP[Object.keys(HAZARD_MAP).find(k => HAZARD_MAP[k].label === b.class)];
            const wa = severityWeight[ma?.severity || 'low'];
            const wb = severityWeight[mb?.severity || 'low'];
            return wa !== wb ? wb - wa : b.score - a.score;
        });

        const top = ranked[0];
        const xCenter = top.bbox[0] + top.bbox[2] / 2;
        const direction = xCenter / videoW < 0.33 ? 'left' : xCenter / videoW > 0.66 ? 'right' : 'front';
        const boxArea   = top.bbox[2] * top.bbox[3];
        const ratio     = boxArea / (videoW * videoH);
        const id        = `${top.class}-${direction}`;
        const prevArea  = lastBoxSizes.current.get(id) || 0;
        const isApproaching = prevArea > 0 && boxArea > prevArea * 1.18;
        lastBoxSizes.current.set(id, boxArea);

        const message = buildAlertMessage(top, direction, isApproaching, ratio, scenario);
        if (!message) return;

        if (onAlert) onAlert(message);

        // Haptic pattern by urgency
        if (hapticEnabled && 'vibrate' in navigator) {
            const urgent = ratio > 0.2 || isApproaching || VEHICLE_CLASSES.has(top.class);
            navigator.vibrate(urgent ? [250, 100, 250, 100, 300] : [120, 50, 120]);
        }

        lastAlertTime.current = now;
    }, [onAlert, hapticEnabled]);

    // ── Detection loop ────────────────────────────────────────
    const startDetectionLoop = useCallback(() => {
        const thresholds = indoorMode ? THRESHOLD_INDOOR : THRESHOLD;
        const detect = async () => {
            const video = videoRef.current;
            if (video && modelRef.current && video.videoWidth > 0) {
                try {
                    const predictions = await modelRef.current.detect(video);
                    const normItem = (requestedItem || '').toLowerCase().trim();

                    const relevant = predictions
                        .filter(p => {
                            const cls = p.class.toLowerCase();
                            if (normItem && cls.includes(normItem))        return p.score > thresholds.requested;
                            if (p.class === 'traffic light')               return p.score > thresholds.traffic;
                            if (PRIORITY_CLASSES.has(p.class))             return p.score > thresholds.priority;
                            if (HAZARD_CLASSES.has(p.class))               return p.score > thresholds.hazard;
                            return p.score > thresholds.default;
                        })
                        .sort((a, b) => {
                            const ar = normItem && a.class.toLowerCase().includes(normItem) ? 1 : 0;
                            const br = normItem && b.class.toLowerCase().includes(normItem) ? 1 : 0;
                            return ar !== br ? br - ar : b.score - a.score;
                        })
                        .slice(0, 14);

                    setDetections(relevant);
                    const scenario = detectScenario(relevant);
                    setCurrentScenario(scenario);
                    if (onDetection) onDetection(relevant);
                    generateAlerts(relevant);

                    // FPS counter
                    frameCount.current++;
                    const now = Date.now();
                    if (now - lastFpsUpdate.current >= 1000) {
                        setFps(frameCount.current);
                        frameCount.current = 0;
                        lastFpsUpdate.current = now;
                    }
                } catch { /* silent */ }
            }
            animationRef.current = requestAnimationFrame(detect);
        };
        animationRef.current = requestAnimationFrame(detect);
    }, [onDetection, generateAlerts, requestedItem, indoorMode]);

    // ── Canvas drawing ────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        const video  = videoRef.current;
        if (!canvas || !video) return;
        const ctx = canvas.getContext('2d');

        let rafId;
        const draw = () => {
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const trafficLight = detections.find(d => d.class === 'traffic light');
            const trafficSignal = trafficLight ? estimateTrafficSignal(trafficLight.bbox) : 'unknown';

            detections.forEach(det => {
                const [x, y, w, h] = det.bbox;
                const conf  = Math.round(det.score * 100);
                const color = getBoxColor(det, requestedItem, trafficSignal);
                const isTarget = requestedItem && det.class.toLowerCase().includes(requestedItem.toLowerCase());

                // Box
                ctx.strokeStyle = color;
                ctx.lineWidth   = isTarget ? 4 : 2.5;
                ctx.strokeRect(x, y, w, h);

                // Corner accents for targets
                if (isTarget) {
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 3;
                    const cs = Math.min(w, h, 20);
                    [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(([cx,cy], i) => {
                        ctx.beginPath();
                        ctx.moveTo(cx + (i % 2 === 0 ? cs : -cs), cy);
                        ctx.lineTo(cx, cy);
                        ctx.lineTo(cx, cy + (i < 2 ? cs : -cs));
                        ctx.stroke();
                    });
                }

                // Label
                const suffix = det.class === 'traffic light' ? ` (${trafficSignal})` : isTarget ? ' ✓' : '';
                const label  = `${det.class}${suffix} ${conf}%`;
                ctx.font = 'bold 13px system-ui, sans-serif';
                const tw = ctx.measureText(label).width;

                // Label background
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.85;
                ctx.beginPath();
                ctx.roundRect?.(x, y - 22, tw + 12, 22, 4) || ctx.fillRect(x, y - 22, tw + 12, 22);
                ctx.fill();
                ctx.globalAlpha = 1;

                // Label text
                ctx.fillStyle = '#fff';
                ctx.fillText(label, x + 6, y - 7);
            });

            rafId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(rafId);
    }, [detections, requestedItem]);

    // ── Render ────────────────────────────────────────────────
    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000', minHeight: 'inherit' }}>
            {/* Error */}
            {error && (
                <div style={{ position: 'absolute', top: '1rem', left: '1rem', right: '1rem', zIndex: 20, background: 'rgba(255,59,85,0.15)', border: '1px solid rgba(255,59,85,0.4)', color: '#ff6b7f', padding: '0.85rem', borderRadius: '12px', fontSize: '0.85rem' }}>
                    {error}
                </div>
            )}

            {/* Loading spinner */}
            {!isModelReady && isCameraActive && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', zIndex: 15 }}>
                    <div style={{ width: 48, height: 48, border: '3px solid rgba(91,143,255,0.3)', borderTopColor: '#5b8fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '1rem' }} />
                    <p style={{ color: '#e8eeff', fontSize: '0.9rem', fontWeight: 600 }}>Loading AI model…</p>
                    <p style={{ color: '#7b8aac', fontSize: '0.78rem', marginTop: '0.3rem' }}>This takes a moment on first load</p>
                </div>
            )}

            {/* Camera feed */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />

            {/* Detection overlay */}
            <canvas
                ref={canvasRef}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            />

            {/* Status bar */}
            {isModelReady && (
                <div style={{ position: 'absolute', bottom: '0.75rem', left: '0.75rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '999px', background: 'rgba(0,0,0,0.7)', color: '#00e0c0', border: '1px solid rgba(0,224,192,0.3)' }}>
                        AI {fps} fps
                    </span>
                    {indoorMode && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '999px', background: 'rgba(255,187,53,0.2)', color: '#ffbb35', border: '1px solid rgba(255,187,53,0.4)' }}>
                            Indoor
                        </span>
                    )}
                    {currentScenario && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '999px', background: 'rgba(91,143,255,0.25)', color: '#5b8fff', border: '1px solid rgba(91,143,255,0.4)' }}>
                            {currentScenario.icon} {currentScenario.label}
                        </span>
                    )}
                </div>
            )}

            {/* Target finder badge */}
            {requestedItem && isModelReady && (
                <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', fontSize: '0.75rem', fontWeight: 700, padding: '0.35rem 0.75rem', borderRadius: '999px', background: 'rgba(159,122,234,0.25)', color: '#c4b5fd', border: '1px solid rgba(159,122,234,0.4)' }}>
                    🔍 {requestedItem}
                </div>
            )}
        </div>
    );
};

export default CameraView;
