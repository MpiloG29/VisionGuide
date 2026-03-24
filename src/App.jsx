import React, { useState, useEffect, useRef } from 'react';
import CameraView from './components/CameraView';
import NavigationService from './services/NavigationService';
import VoiceInputService from './services/VoiceInputService';
import './styles/App.css';

function App() {
    const [mode, setMode] = useState('camera');
    const [destination, setDestination] = useState(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [navigationStatus, setNavigationStatus] = useState(null);
    const [voiceTranscript, setVoiceTranscript] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [lastAlert, setLastAlert] = useState(null);
    
    const navigationService = useRef(new NavigationService());
    const voiceService = useRef(new VoiceInputService());

    useEffect(() => {
        voiceService.current.init();
        voiceService.current.onCommand(handleVoiceCommand);
        voiceService.current.onTranscript(setVoiceTranscript);
        
        navigationService.current.startLocationTracking((location) => {
            if (navigationService.current.isNavigating) {
                updateNavigationStatus();
            }
        });
        
        navigationService.current.onArrival(() => {
            setIsNavigating(false);
            speakMessage('You have arrived at your destination. Safe travels!');
        });
        
        return () => {
            navigationService.current.stopLocationTracking();
            voiceService.current.stopListening();
        };
    }, []);

    const handleVoiceCommand = async (command, params) => {
        switch (command) {
            case 'navigate':
                if (params && params.destination) {
                    await setDestinationFromVoice(params.destination);
                } else {
                    speakMessage('Please say the destination after navigate to');
                }
                break;
            case 'stop':
                stopNavigation();
                speakMessage('Navigation stopped');
                break;
            case 'where':
                speakCurrentLocation();
                break;
            case 'status':
                speakNavigationStatus();
                break;
            case 'repeat':
                repeatLastInstruction();
                break;
            case 'help':
                speakHelp();
                break;
            default:
                break;
        }
    };

    const setDestinationFromVoice = async (destinationText) => {
        speakMessage('Setting destination to ' + destinationText);
        
        const mockLocation = { lat: -33.9249, lng: 18.4241 };
        const route = await navigationService.current.calculateRoute(mockLocation);
        
        if (route) {
            setDestination(mockLocation);
            navigationService.current.startNavigation();
            setIsNavigating(true);
            speakMessage('Route found. ' + Math.round(route.totalDistance) + ' meters. Starting navigation.');
            updateNavigationStatus();
        } else {
            speakMessage('Sorry, could not find a route to that destination');
        }
    };

    const stopNavigation = () => {
        navigationService.current.stopNavigation();
        setIsNavigating(false);
        setDestination(null);
    };

    const speakCurrentLocation = () => {
        const location = navigationService.current.currentPosition;
        if (location) {
            speakMessage('You are at latitude ' + location.lat.toFixed(4) + ', longitude ' + location.lng.toFixed(4));
        } else {
            speakMessage('Getting your location...');
        }
    };

    const speakNavigationStatus = () => {
        const status = navigationService.current.getStatus();
        if (status.isNavigating) {
            const distance = Math.round(status.remainingDistance);
            const minutes = Math.round(status.remainingDuration / 60);
            speakMessage(status.currentStep + ' of ' + status.totalSteps + '. ' + distance + ' meters remaining, about ' + minutes + ' minutes.');
        } else {
            speakMessage('No active navigation');
        }
    };

    const repeatLastInstruction = () => {
        const status = navigationService.current.getStatus();
        if (status.isNavigating && status.currentInstruction) {
            speakMessage(status.currentInstruction);
        }
    };

    const speakHelp = () => {
        const commands = voiceService.current.getCommandsList();
        const helpText = Object.values(commands).join('. ');
        speakMessage(helpText);
    };

    const speakMessage = (message) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        }
    };

    const toggleVoiceListening = () => {
        if (isListening) {
            voiceService.current.stopListening();
            setIsListening(false);
            speakMessage('Voice commands off');
        } else {
            voiceService.current.startListening();
            setIsListening(true);
            speakMessage('Voice commands on. Say help for commands');
        }
    };

    const updateNavigationStatus = () => {
        const status = navigationService.current.getStatus();
        setNavigationStatus(status);
    };

    const handleDetection = (detections) => {
        if (detections && detections.length > 0) {
            const topDetection = detections[0];
            setLastAlert({
                object: topDetection.class,
                confidence: Math.round(topDetection.score * 100)
            });
        }
    };

    const handleAlert = (alertMessage) => {
        setLastAlert({ message: alertMessage });
        speakMessage(alertMessage);
    };

    return (
        <div className="min-h-screen bg-gray-900">
            <header className="bg-blue-600 text-white p-4 shadow-lg">
                <div className="container mx-auto flex justify-between items-center">
                    <h1 className="text-xl font-bold">VisionGuide</h1>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setMode('camera')}
                            className={'px-4 py-2 rounded ' + (mode === 'camera' ? 'bg-blue-800' : 'bg-blue-500')}
                        >
                            Camera
                        </button>
                        <button
                            onClick={toggleVoiceListening}
                            className={'px-4 py-2 rounded ' + (isListening ? 'bg-green-600 animate-pulse' : 'bg-gray-600')}
                        >
                            ?? {isListening ? 'Listening' : 'Voice'}
                        </button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto p-4">
                <div className="bg-black rounded-lg overflow-hidden shadow-xl" style={{ height: '60vh' }}>
                    {mode === 'camera' && (
                        <CameraView 
                            onDetection={handleDetection}
                            onAlert={handleAlert}
                        />
                    )}
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg p-4 shadow">
                        <h3 className="font-bold text-lg mb-2">Navigation</h3>
                        {isNavigating && navigationStatus ? (
                            <div>
                                <p className="text-sm text-gray-600">Step {navigationStatus.currentStep} of {navigationStatus.totalSteps}</p>
                                <p className="font-medium mt-1">{navigationStatus.currentInstruction}</p>
                                <div className="mt-2 text-sm">
                                    <span>Remaining: {Math.round(navigationStatus.remainingDistance)}m</span>
                                    <span className="ml-4">~{Math.round(navigationStatus.remainingDuration / 60)} min</span>
                                </div>
                                <button
                                    onClick={stopNavigation}
                                    className="mt-3 bg-red-500 text-white px-4 py-2 rounded text-sm"
                                >
                                    Stop Navigation
                                </button>
                            </div>
                        ) : (
                            <p className="text-gray-500">Say "navigate to [place]" to start</p>
                        )}
                    </div>

                    <div className="bg-white rounded-lg p-4 shadow">
                        <h3 className="font-bold text-lg mb-2">Obstacle Alerts</h3>
                        {lastAlert ? (
                            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3">
                                <p className="font-medium text-yellow-800">
                                    ?? {lastAlert.object || lastAlert.message || 'Obstacle detected'}
                                </p>
                                {lastAlert.confidence && (
                                    <p className="text-sm text-yellow-600">Confidence: {lastAlert.confidence}%</p>
                                )}
                            </div>
                        ) : (
                            <p className="text-gray-500">No obstacles detected</p>
                        )}
                    </div>
                </div>

                {voiceTranscript && (
                    <div className="mt-4 bg-gray-800 rounded-lg p-3">
                        <p className="text-gray-300 text-sm">
                            <span className="text-green-400">You said:</span> {voiceTranscript}
                        </p>
                    </div>
                )}

                <div className="mt-4 bg-blue-50 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-800 mb-2">Voice Commands</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                        <span>??? "navigate to [place]"</span>
                        <span>?? "stop navigation"</span>
                        <span>?? "where am I"</span>
                        <span>?? "status"</span>
                        <span>?? "repeat"</span>
                        <span>? "help"</span>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;
