import React, { useState, useEffect, useRef } from 'react';
import CameraView from './components/CameraView';
import NavigationService from './services/NavigationService';
import VoiceInputService from './services/VoiceInputService';
import './styles/App.css';

function App() {
    const [destination, setDestination] = useState('');
    const [isNavigating, setIsNavigating] = useState(false);
    const [navigationStatus, setNavigationStatus] = useState(null);
    const [voiceTranscript, setVoiceTranscript] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [lastAlert, setLastAlert] = useState(null);
    const [sceneSummary, setSceneSummary] = useState('I am warming up and watching your surroundings.');
    const [requestedItem, setRequestedItem] = useState('');

    const navigationService = useRef(new NavigationService());
    const voiceService = useRef(new VoiceInputService());
    const lastSceneSpeechAt = useRef(0);

    useEffect(() => {
        voiceService.current.init();
        voiceService.current.onCommand(handleVoiceCommand);
        voiceService.current.onTranscript(setVoiceTranscript);

        navigationService.current.startLocationTracking(() => {
            if (navigationService.current.isNavigating) {
                updateNavigationStatus();
            }
        });

        navigationService.current.onArrival(() => {
            setIsNavigating(false);
            setDestination('');
            speakMessage('You have arrived at your destination. Great job!');
        });

        const welcomeTimer = setTimeout(() => {
            speakMessage('Hi! I can describe what I see, help navigate, and find objects near you. Where are you going, or what do you want me to find?');
        }, 1200);

        return () => {
            clearTimeout(welcomeTimer);
            navigationService.current.stopLocationTracking();
            voiceService.current.stopListening();
            window.speechSynthesis?.cancel();
        };
    }, []);

    const handleVoiceCommand = async (command, params) => {
        switch (command) {
            case 'navigate':
                if (params?.destination) {
                    await setDestinationFromVoice(params.destination);
                } else {
                    speakMessage('Tell me where you want to go, for example, navigate to central park.');
                }
                break;
            case 'find':
                if (params?.item) {
                    setRequestedItem(params.item);
                    speakMessage(`Okay, I will watch for ${params.item}.`);
                } else {
                    speakMessage('Tell me what you want me to find. For example: find my keys.');
                }
                break;
            case 'see':
                speakSceneSummary();
                break;
            case 'stop':
                stopNavigation();
                speakMessage('Navigation stopped.');
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
        setDestination(destinationText);
        speakMessage(`Setting destination to ${destinationText}.`);

        const mockLocation = { lat: -33.9249, lng: 18.4241 };
        const route = await navigationService.current.calculateRoute(mockLocation);

        if (route) {
            navigationService.current.startNavigation();
            setIsNavigating(true);
            speakMessage(`Route found. ${Math.round(route.totalDistance)} meters. Starting navigation now.`);
            updateNavigationStatus();
        } else {
            speakMessage('Sorry, I could not find a route for that destination.');
        }
    };

    const stopNavigation = () => {
        navigationService.current.stopNavigation();
        setIsNavigating(false);
        setDestination('');
    };

    const speakCurrentLocation = () => {
        const location = navigationService.current.currentPosition;
        if (location) {
            speakMessage(`You are near latitude ${location.lat.toFixed(4)} and longitude ${location.lng.toFixed(4)}.`);
        } else {
            speakMessage('I am still getting your location.');
        }
    };

    const speakNavigationStatus = () => {
        const status = navigationService.current.getStatus();
        if (status.isNavigating) {
            const distance = Math.round(status.remainingDistance);
            const minutes = Math.round(status.remainingDuration / 60);
            speakMessage(`Step ${status.currentStep} of ${status.totalSteps}. ${distance} meters remaining, about ${minutes} minutes.`);
        } else {
            speakMessage('You are not currently navigating.');
        }
    };

    const repeatLastInstruction = () => {
        const status = navigationService.current.getStatus();
        if (status.isNavigating && status.currentInstruction) {
            speakMessage(status.currentInstruction);
        } else {
            speakMessage('There is no active instruction to repeat.');
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
            utterance.rate = 0.95;
            utterance.pitch = 1;
            window.speechSynthesis.speak(utterance);
        }
    };

    const speakSceneSummary = () => {
        speakMessage(sceneSummary);
    };

    const toggleVoiceListening = () => {
        if (isListening) {
            voiceService.current.stopListening();
            setIsListening(false);
            speakMessage('Voice commands are now off.');
        } else {
            voiceService.current.startListening();
            setIsListening(true);
            speakMessage('Voice commands are on. Ask me what I see, where you are going, or what to find.');
        }
    };

    const updateNavigationStatus = () => {
        const status = navigationService.current.getStatus();
        setNavigationStatus(status);
    };

    const buildSceneSummary = (detections) => {
        if (!detections || detections.length === 0) {
            return 'I do not see major objects right now. The path in front looks clear.';
        }

        const grouped = detections.reduce((acc, det) => {
            acc[det.class] = (acc[det.class] || 0) + 1;
            return acc;
        }, {});

        const topItems = Object.entries(grouped)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([name, count]) => `${count} ${name}${count > 1 ? 's' : ''}`);

        const baseSummary = `I currently see ${topItems.join(', ')} around you.`;

        if (requestedItem) {
            const foundItem = detections.find((det) => det.class.toLowerCase() === requestedItem.toLowerCase());
            if (foundItem) {
                return `${baseSummary} I found ${requestedItem} in view.`;
            }
            return `${baseSummary} I am still looking for ${requestedItem}.`;
        }

        return baseSummary;
    };

    const handleDetection = (detections) => {
        const summary = buildSceneSummary(detections);
        setSceneSummary(summary);

        if (detections?.length > 0) {
            const topDetection = detections[0];
            setLastAlert({
                object: topDetection.class,
                confidence: Math.round(topDetection.score * 100)
            });
        }

        const now = Date.now();
        const shouldSpeak = now - lastSceneSpeechAt.current > 10000;
        const itemFound = requestedItem
            ? detections.some((det) => det.class.toLowerCase() === requestedItem.toLowerCase())
            : false;

        if (itemFound && shouldSpeak) {
            speakMessage(`Good news, I can see ${requestedItem}.`);
            lastSceneSpeechAt.current = now;
        }
    };

    const handleAlert = (alertMessage) => {
        setLastAlert({ message: alertMessage });
        speakMessage(alertMessage);
    };

    return (
        <div className="app-shell">
            <header className="hero-header">
                <div>
                    <p className="hero-kicker">AI Mobility Assistant</p>
                    <h1 className="hero-title">VisionGuide</h1>
                    <p className="hero-subtitle">Beautiful live guidance for wherever you stand, sit, or walk.</p>
                </div>
                <button
                    onClick={toggleVoiceListening}
                    className={`voice-toggle ${isListening ? 'is-listening' : ''}`}
                >
                    {isListening ? '🎙 Listening' : '🎤 Start voice'}
                </button>
            </header>

            <main className="app-content">
                <section className="camera-card">
                    <CameraView onDetection={handleDetection} onAlert={handleAlert} />
                </section>

                <section className="cards-grid">
                    <article className="status-card">
                        <h3>Navigation</h3>
                        {isNavigating && navigationStatus ? (
                            <>
                                <p className="muted">Step {navigationStatus.currentStep} of {navigationStatus.totalSteps}</p>
                                <p className="highlight">{navigationStatus.currentInstruction}</p>
                                <p className="muted">{Math.round(navigationStatus.remainingDistance)}m left · ~{Math.round(navigationStatus.remainingDuration / 60)} min</p>
                                <button className="danger-btn" onClick={stopNavigation}>Stop Navigation</button>
                            </>
                        ) : (
                            <p className="muted">Say: “navigate to [place]”.</p>
                        )}
                        {destination && <p className="chip">Destination: {destination}</p>}
                    </article>

                    <article className="status-card">
                        <h3>What I See</h3>
                        <p className="highlight">{sceneSummary}</p>
                        {requestedItem && <p className="chip">Looking for: {requestedItem}</p>}
                        {lastAlert && (
                            <p className="alert-text">
                                Alert: {lastAlert.object || lastAlert.message}
                                {lastAlert.confidence ? ` (${lastAlert.confidence}%)` : ''}
                            </p>
                        )}
                    </article>
                </section>

                {voiceTranscript && (
                    <section className="transcript-card">
                        <p><strong>You said:</strong> {voiceTranscript}</p>
                    </section>
                )}

                <section className="commands-card">
                    <h4>Things you can say</h4>
                    <div className="commands-grid">
                        <span>“navigate to office”</span>
                        <span>“find my phone”</span>
                        <span>“what do you see”</span>
                        <span>“where am I”</span>
                        <span>“status”</span>
                        <span>“help”</span>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default App;