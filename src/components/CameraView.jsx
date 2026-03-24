import React, { useRef, useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

const CameraView = ({ onDetection, onAlert }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const modelRef = useRef(null);
    const animationRef = useRef(null);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isModelReady, setIsModelReady] = useState(false);
    const [detections, setDetections] = useState([]);
    const [error, setError] = useState(null);
    const [fps, setFps] = useState(0);
    
    const lastAlertTime = useRef(0);
    const frameCount = useRef(0);
    const lastFpsUpdate = useRef(Date.now());

    useEffect(() => {
        initCamera();
        loadModel();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, []);

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
                    startDetectionLoop();
                };
            }
        } catch (err) {
            console.error('Camera error:', err);
            setError('Unable to access camera. Please check permissions.');
        }
    };

    const loadModel = async () => {
        try {
            await tf.ready();
            console.log('TensorFlow ready');
            modelRef.current = await cocoSsd.load();
            setIsModelReady(true);
            console.log('COCO-SSD model loaded');
        } catch (err) {
            console.error('Model error:', err);
            setError('Failed to load AI model. Please refresh.');
        }
    };

    const startDetectionLoop = () => {
        const detect = async () => {
            if (videoRef.current && modelRef.current && isModelReady && videoRef.current.videoWidth > 0) {
                try {
                    const predictions = await modelRef.current.detect(videoRef.current);
                    const relevant = predictions.filter(p => p.score > 0.5);
                    setDetections(relevant);
                    
                    if (onDetection) onDetection(relevant);
                    generateAlerts(relevant);
                    updateFpsCounter();
                } catch (err) {
                    console.error('Detection error:', err);
                }
            }
            animationRef.current = requestAnimationFrame(detect);
        };
        detect();
    };

    const generateAlerts = (detections) => {
        const now = Date.now();
        if (now - lastAlertTime.current < 3000) return;
        
        const hazardous = detections.filter(d => 
            ['person', 'car', 'truck', 'bus', 'motorcycle', 'bicycle'].includes(d.class)
        );
        
        if (hazardous.length > 0) {
            const top = hazardous[0];
            const videoWidth = videoRef.current?.videoWidth || 640;
            const xCenter = top.bbox[0] + top.bbox[2] / 2;
            const pos = xCenter / videoWidth;
            
            let direction = pos < 0.33 ? 'left' : pos > 0.66 ? 'right' : 'center';
            const boxArea = top.bbox[2] * top.bbox[3];
            const screenArea = videoWidth * (videoRef.current?.videoHeight || 480);
            const distance = boxArea / screenArea > 0.2 ? 'close' : 'ahead';
            
            if (onAlert) {
                const alertMsg = top.class + ' on your ' + direction + ', ' + distance;
                onAlert(alertMsg);
                lastAlertTime.current = now;
            }
        }
    };

    const updateFpsCounter = () => {
        frameCount.current++;
        const now = Date.now();
        if (now - lastFpsUpdate.current >= 1000) {
            setFps(frameCount.current);
            frameCount.current = 0;
            lastFpsUpdate.current = now;
        }
    };

    // Draw on canvas
    useEffect(() => {
        if (!canvasRef.current || !videoRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        const draw = () => {
            if (!videoRef.current) return;
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            detections.forEach(det => {
                const [x, y, w, h] = det.bbox;
                const conf = Math.round(det.score * 100);
                let color = '#00ff00';
                if (['person', 'car', 'truck', 'bus'].includes(det.class)) color = '#ff4444';
                else if (['bicycle', 'motorcycle'].includes(det.class)) color = '#ffaa44';
                
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, w, h);
                
                ctx.fillStyle = color;
                const text = det.class + ' ' + conf + '%';
                const textWidth = ctx.measureText(text).width;
                ctx.fillRect(x, y - 25, textWidth + 10, 25);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 14px Arial';
                ctx.fillText(text, x + 5, y - 8);
            });
            
            requestAnimationFrame(draw);
        };
        
        draw();
    }, [detections]);

    return (
        <div className="relative w-full h-full bg-black">
            {error && (
                <div className="absolute top-4 left-4 right-4 bg-red-500 text-white p-3 rounded z-10">
                    {error}
                </div>
            )}
            
            {!isModelReady && isCameraActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 z-10">
                    <div className="text-white text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                        <p>Loading AI model... {fps > 0 ? 'Ready' : 'Please wait'}</p>
                        <p className="text-sm mt-2 text-gray-400">First load may take 10-30 seconds</p>
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
            
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
            />
            
            {isModelReady && (
                <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white px-3 py-1 rounded text-sm">
                    AI Active | {fps} FPS
                </div>
            )}
        </div>
    );
};

export default CameraView;
