import React, { useState, useEffect, useRef } from 'react';
import CameraView from './components/CameraView';
import NavigationService from './services/NavigationService';
import VoiceInputService from './services/VoiceInputService';
import './styles/App.css';

const onboardingSteps = [
    { title: 'Step 1: Start Voice', text: 'Tap to Speak or say help to hear commands.' },
    { title: 'Step 2: Navigate in Real Time', text: 'Say navigate to your destination to get live route options.' },
    { title: 'Step 3: Emergency Ready', text: 'Say emergency or call my mother to trigger fast contact support.' }
];

const defaultContacts = {
    mother: '+27791825118',
    father: '+27680261635',
    sister: '+27784304420',
    friend: '+10000000004',
    daughter: '+10000000005'
};

const personalityModes = {
    calm: {
        label: 'Calm Guide',
        intro: 'Steady, supportive guidance for everyday movement.',
        style: 'calm'
    },
    energetic: {
        label: 'Energetic Helper',
        intro: 'Upbeat motivation with fast, confident feedback.',
        style: 'energetic'
    },
    minimal: {
        label: 'Minimal Voice',
        intro: 'Short, direct guidance with less talking.',
        style: 'minimal'
    }
};

const starterPlaces = [
    { key: 'home', label: 'Home', destination: 'Home', accent: 'sunrise' },
    { key: 'work', label: 'Work', destination: 'Work', accent: 'ocean' },
    { key: 'clinic', label: 'Clinic', destination: 'Nearest clinic', accent: 'mint' },
    { key: 'mall', label: 'Mall', destination: 'Nearest mall', accent: 'sunset' }
];

const defaultQuickActions = [
    { label: 'Share live location', kind: 'location' },
    { label: 'Looking for nearby help', kind: 'help' }
];

function App() {
    const [destination, setDestination] = useState('');
    const [isNavigating, setIsNavigating] = useState(false);
    const [navigationStatus, setNavigationStatus] = useState(null);
    const [voiceTranscript, setVoiceTranscript] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [lastAlert, setLastAlert] = useState(null);
    const [sceneSummary, setSceneSummary] = useState('Warming up camera and scanning your surroundings.');
    const [requestedItem, setRequestedItem] = useState('');
    const [mapsUrl, setMapsUrl] = useState('');
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [assistantResponse, setAssistantResponse] = useState('I am ready. Ask me anything by saying assistant followed by your question.');
    const [nearbySummary, setNearbySummary] = useState('Checking nearby safe spots.');
    const [emergencyMode, setEmergencyMode] = useState(false);
    const [emergencyContacts] = useState(defaultContacts);
    const [safetyOptions, setSafetyOptions] = useState({ avoidBusyRoutes: true, avoidMountainous: true, avoidTolls: true });
    const [liveLocation, setLiveLocation] = useState(null);
    const [locationName, setLocationName] = useState('');
    const [locationUpdatedAt, setLocationUpdatedAt] = useState('');
    const [commandOutput, setCommandOutput] = useState('Your voice results will appear here. Ask for live location, traffic, nearby help, or navigation.');
    const [personality, setPersonality] = useState('calm');
    const [savedPlaces, setSavedPlaces] = useState(starterPlaces);
    const [resultCard, setResultCard] = useState({
        title: 'Ready to help',
        body: 'Use your voice or tap a shortcut to get started.',
        tone: 'info',
        actions: defaultQuickActions
    });

    const navigationService = useRef(new NavigationService());
    const voiceService = useRef(new VoiceInputService());
    const lastSceneSpeechAt = useRef(0);

    useEffect(() => {
        const storedMode = window.localStorage?.getItem('visionguide-personality');
        if (storedMode && personalityModes[storedMode]) setPersonality(storedMode);

        voiceService.current.init();
        voiceService.current.onCommand(handleVoiceCommand);
        voiceService.current.onTranscript(setVoiceTranscript);

        navigationService.current.startLocationTracking((position) => {
            if (position) {
                setLiveLocation(position);
                setLocationUpdatedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            }
            if (navigationService.current.isNavigating) updateNavigationStatus();
        });

        const nearbyTimer = setInterval(async () => {
            const suggestions = await navigationService.current.getNearbySuggestions();
            if (suggestions?.restroom && suggestions?.mall) {
                setNearbySummary(`Nearest restroom and mall are ready for quick opening.`);
            }
        }, 60000);

        navigationService.current.onArrival(() => {
            setIsNavigating(false);
            setDestination('');
            setMapsUrl('');
            speakMessage('You have arrived at your destination. Great job!');
        });

        const welcomeTimer = setTimeout(() => {
            speakMessage('Welcome to VisionGuide. I can guide, detect danger, suggest nearby places, and call emergency contacts by voice.');
        }, 1200);

        return () => {
            clearTimeout(welcomeTimer);
            clearInterval(nearbyTimer);
            navigationService.current.stopLocationTracking();
            voiceService.current.stopListening();
            window.speechSynthesis?.cancel();
        };
    }, []);

    const openGoogleMaps = (url) => {
        setMapsUrl(url);
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const applyVoiceStyle = (message) => {
        if (!message) return message;
        if (personality === 'energetic') return `${message} You've got this.`;
        if (personality === 'minimal') return message.split('. ')[0];
        return message;
    };

    const updateResultCard = (card) => {
        setResultCard((prev) => ({ ...prev, ...card }));
    };

    const updateOutput = (message) => {
        const voicedMessage = applyVoiceStyle(message);
        setAssistantResponse(voicedMessage);
        setCommandOutput(voicedMessage);
    };

    const changePersonality = (mode) => {
        setPersonality(mode);
        window.localStorage?.setItem('visionguide-personality', mode);
        updateOutput(`Assistant mode changed to ${personalityModes[mode].label}. ${personalityModes[mode].intro}`);
        updateResultCard({
            title: personalityModes[mode].label,
            body: personalityModes[mode].intro,
            tone: 'celebrate',
            actions: defaultQuickActions
        });
    };

    const handleAssistantQuery = async (question) => {
        const q = (question || '').toLowerCase();
        if (!q) {
            updateOutput('Please ask a question after saying assistant.');
            speakMessage('Please ask a question after saying assistant.');
            return;
        }

        if (q.includes('nearest') || q.includes('close')) {
            await navigationService.current.getNearbySuggestions();
            const response = `I can open nearest restroom, mall, hospital, or police station. Say nearest restroom, nearest mall, or closest help now.`;
            updateOutput(response);
            updateResultCard({
                title: 'Nearby options',
                body: 'I found quick nearby categories you can open right away.',
                tone: 'info',
                actions: [
                    { label: 'Nearest restroom', kind: 'restroom' },
                    { label: 'Nearest mall', kind: 'mall' },
                    { label: 'Closest help', kind: 'help' }
                ]
            });
            speakMessage(response);
            return;
        }

        if (q.includes('traffic')) {
            const status = navigationService.current.getStatus();
            const response = status.trafficSummary || 'Traffic summary is not available.';
            updateOutput(response);
            updateResultCard({
                title: 'Traffic summary',
                body: response,
                tone: 'warning',
                actions: [
                    { label: 'Share live location', kind: 'location' },
                    { label: 'Navigate safely', kind: 'saved-place', value: 'Work' }
                ]
            });
            speakMessage(response);
            return;
        }

        if (q.includes('where am i') || q.includes('live location') || q.includes('my location')) {
            speakCurrentLocation();
            return;
        }

        const fallback = 'I can help with navigation, nearby places, traffic summary, emergency calling, and object finding.';
        updateOutput(fallback);
        updateResultCard({
            title: 'What I can do',
            body: fallback,
            tone: 'info',
            actions: [
                { label: 'Share live location', kind: 'location' },
                { label: 'Looking for nearby help', kind: 'help' },
                { label: 'Nearest mall', kind: 'mall' }
            ]
        });
        speakMessage(fallback);
    };

    const handleVoiceCommand = async (command, params) => {
        switch (command) {
            case 'navigate':
                if (params?.destination) await setDestinationFromVoice(params.destination);
                else {
                    updateOutput('Tell me where you want to go, for example navigate to Central Park.');
                    updateResultCard({
                        title: 'Navigation ready',
                        body: 'You can say a place name or tap one of your saved places below.',
                        tone: 'info',
                        actions: savedPlaces.slice(0, 3).map((place) => ({
                            label: place.label,
                            kind: 'saved-place',
                            value: place.destination
                        }))
                    });
                    speakMessage('Tell me where you want to go, for example navigate to Central Park.');
                }
                break;
            case 'find':
                if (params?.item) {
                    setRequestedItem(params.item);
                    updateOutput(`Looking for ${params.item} in the live camera view.`);
                    updateResultCard({
                        title: `Finding ${params.item}`,
                        body: 'The camera is now watching for that item in your surroundings.',
                        tone: 'celebrate',
                        actions: [
                            { label: 'What do you see', kind: 'scene' },
                            { label: 'Share live location', kind: 'location' }
                        ]
                    });
                    speakMessage(`Okay, I will watch for ${params.item}.`);
                } else {
                    updateOutput('Tell me what to find. For example: find my phone.');
                    speakMessage('Tell me what to find. For example: find my phone.');
                }
                break;
            case 'nearbyRestroom':
                await announceNearbyPlaces('restroom');
                break;
            case 'nearbyMall':
                await announceNearbyPlaces('mall');
                break;
            case 'nearbyHelp':
                await announceNearbyPlaces('help');
                break;
            case 'emergency':
                triggerEmergency('mother');
                break;
            case 'call':
                triggerEmergency(params?.contact || 'friend');
                break;
            case 'assistant':
                await handleAssistantQuery(params?.question);
                break;
            case 'see':
                updateOutput(sceneSummary);
                speakMessage(sceneSummary);
                break;
            case 'stop':
                stopNavigation();
                updateOutput('Navigation stopped.');
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

    const triggerEmergency = (contactName) => {
        const name = (contactName || '').toLowerCase();
        const number = emergencyContacts[name] || emergencyContacts.friend;
        setEmergencyMode(true);
        updateOutput(`Emergency mode active. Calling ${name || 'friend'} on ${number}.`);
        updateResultCard({
            title: 'Emergency mode active',
            body: `Calling ${name || 'friend'} now on ${number}.`,
            tone: 'danger',
            actions: [
                { label: 'Call mother', kind: 'call', value: 'mother' },
                { label: 'Call sister', kind: 'call', value: 'sister' },
                { label: 'Call father', kind: 'call', value: 'father' }
            ]
        });
        speakMessage(`Emergency mode active. Calling ${name || 'friend'} now.`);
        window.location.href = `tel:${number}`;
    };

    const setDestinationFromVoice = async (destinationText) => {
        setDestination(destinationText);
        updateOutput(`Setting destination to ${destinationText}.`);
        speakMessage(`Setting destination to ${destinationText}.`);

        const route = await navigationService.current.calculateRoute(destinationText, safetyOptions);
        if (!route) {
            updateOutput('Sorry, I could not find a safe route.');
            speakMessage('Sorry, I could not find a safe route.');
            return;
        }

        navigationService.current.startNavigation();
        setIsNavigating(true);
        setMapsUrl(route.googleMapsUrl);
        updateOutput(`Route found to ${destinationText}. ${route.routeProfile}`);
        updateResultCard({
            title: `Route ready: ${destinationText}`,
            body: `${route.routeProfile} Distance ${Math.round(route.totalDistance)} meters, around ${Math.round(route.totalDuration / 60)} minutes.`,
            tone: 'celebrate',
            actions: [
                { label: 'Open route', kind: 'open-maps', value: route.googleMapsUrl },
                { label: 'Repeat status', kind: 'status' }
            ]
        });
        speakMessage(`Route found. ${route.routeProfile} Opening Google Maps now.`);
        openGoogleMaps(route.googleMapsUrl);
        updateNavigationStatus();
    };

    const announceNearbyPlaces = async (type) => {
        const result = await navigationService.current.findNearby(type);
        updateOutput(result.announcement);
        updateResultCard({
            title: type === 'help' ? 'Emergency landmarks nearby' : `Nearby ${type}`,
            body: result.announcement,
            tone: 'info',
            actions: result.actions?.length
                ? result.actions
                : [
                    { label: 'Open in Maps', kind: 'open-maps', value: result.googleMapsUrl },
                    { label: 'Live location', kind: 'location' }
                ]
        });
        speakMessage(result.announcement);
        if (type !== 'help' && result.googleMapsUrl) openGoogleMaps(result.googleMapsUrl);
    };

    const stopNavigation = () => {
        navigationService.current.stopNavigation();
        setIsNavigating(false);
        setDestination('');
        setMapsUrl('');
    };

    const speakCurrentLocation = async () => {
        const location = navigationService.current.currentPosition;
        if (location) {
            const readableLocation = await navigationService.current.reverseGeocodeLocation(location);
            if (readableLocation) setLocationName(readableLocation);
            const accuracy = location.accuracy ? `with about ${Math.round(location.accuracy)} meter accuracy` : '';
            const locationMessage = readableLocation
                ? `Live location: ${readableLocation}. Coordinates ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} ${accuracy}`.trim()
                : `Live location: latitude ${location.lat.toFixed(5)}, longitude ${location.lng.toFixed(5)} ${accuracy}`.trim();
            updateOutput(locationMessage);
            setMapsUrl(`https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`);
            updateResultCard({
                title: 'Live location',
                body: locationMessage,
                tone: 'info',
                actions: [
                    { label: 'Open in Maps', kind: 'open-maps', value: `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}` },
                    { label: 'Looking for nearby help', kind: 'help' }
                ]
            });
            speakMessage(
                readableLocation
                    ? `You are near ${readableLocation}, ${accuracy}.`
                    : `You are near latitude ${location.lat.toFixed(4)} and longitude ${location.lng.toFixed(4)}, ${accuracy}.`
            );
        } else {
            updateOutput('I am still getting your live location.');
            speakMessage('I am still getting your location.');
        }
    };

    const speakNavigationStatus = () => {
        const status = navigationService.current.getStatus();
        if (status.isNavigating) {
            updateOutput(`Navigation status: step ${status.currentStep} of ${status.totalSteps}. ${Math.round(status.remainingDistance)} meters remaining. ${status.trafficSummary || ''}`);
            updateResultCard({
                title: 'Journey progress',
                body: `Step ${status.currentStep} of ${status.totalSteps}. ${status.currentInstruction || 'Keep moving safely.'}`,
                tone: 'celebrate',
                actions: [
                    { label: 'Open route', kind: 'open-maps', value: status.googleMapsUrl },
                    { label: 'Repeat', kind: 'repeat' }
                ]
            });
            speakMessage(`Step ${status.currentStep} of ${status.totalSteps}. ${Math.round(status.remainingDistance)} meters remaining. ${status.trafficSummary || ''}`);
        } else {
            updateOutput('You are not currently navigating.');
            speakMessage('You are not currently navigating.');
        }
    };

    const repeatLastInstruction = () => {
        const status = navigationService.current.getStatus();
        if (status.isNavigating && status.currentInstruction) {
            updateOutput(status.currentInstruction);
            speakMessage(status.currentInstruction);
        } else {
            updateOutput('There is no active instruction to repeat.');
            speakMessage('There is no active instruction to repeat.');
        }
    };

    const speakHelp = () => {
        const commands = voiceService.current.getCommandsList();
        updateOutput('Available commands: live location, navigate, nearest restroom, nearest hospital, find an item, emergency, call my mother, status, and repeat.');
        speakMessage(Object.values(commands).join(' '));
    };

    const speakMessage = (message) => {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 0.95;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
    };

    const updateNavigationStatus = () => {
        const status = navigationService.current.getStatus();
        setNavigationStatus(status);
    };

    const buildSceneSummary = (detections) => {
        if (!detections || detections.length === 0) return 'No major obstacles right now. Your immediate path seems clear.';
        const grouped = detections.reduce((acc, det) => ({ ...acc, [det.class]: (acc[det.class] || 0) + 1 }), {});
        const topItems = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => `${count} ${name}${count > 1 ? 's' : ''}`);
        const trafficLight = detections.find((det) => det.class === 'traffic light');
        const baseSummary = `I currently see ${topItems.join(', ')} around you.`;
        if (trafficLight) return `${baseSummary} Traffic robot detected. I will announce if it looks red or green.`;
        if (requestedItem) {
            const foundItem = detections.find((det) => det.class.toLowerCase() === requestedItem.toLowerCase());
            if (foundItem) return `${baseSummary} I found ${requestedItem}.`;
            return `${baseSummary} I am still looking for ${requestedItem}.`;
        }
        return baseSummary;
    };

    const handleDetection = (detections) => {
        const summary = buildSceneSummary(detections);
        setSceneSummary(summary);

        if (detections?.length > 0) {
            const topDetection = detections[0];
            setLastAlert({ object: topDetection.class, confidence: Math.round(topDetection.score * 100) });
        }

        const now = Date.now();
        const shouldSpeak = now - lastSceneSpeechAt.current > 10000;
        const itemFound = requestedItem ? detections.some((det) => det.class.toLowerCase() === requestedItem.toLowerCase()) : false;
        if (itemFound && shouldSpeak) {
            updateOutput(`Good news, I can see ${requestedItem}.`);
            speakMessage(`Good news, I can see ${requestedItem}.`);
            lastSceneSpeechAt.current = now;
        }
    };

    const handleAlert = (alertMessage) => {
        setLastAlert({ message: alertMessage });
        updateOutput(alertMessage);
        updateResultCard({
            title: 'Safety alert',
            body: alertMessage,
            tone: 'danger',
            actions: [
                { label: 'Share live location', kind: 'location' },
                { label: 'Call mother', kind: 'call', value: 'mother' }
            ]
        });
        speakMessage(alertMessage);
        if (alertMessage.toLowerCase().includes('coming closer') && emergencyMode) {
            triggerEmergency('friend');
        }
    };

    const activateQuickAction = async (action) => {
        switch (action.kind) {
            case 'location':
                speakCurrentLocation();
                break;
            case 'restroom':
                await announceNearbyPlaces('restroom');
                break;
            case 'mall':
                await announceNearbyPlaces('mall');
                break;
            case 'help':
                await announceNearbyPlaces('help');
                break;
            case 'open-maps':
                if (action.value) openGoogleMaps(action.value);
                break;
            case 'saved-place':
                if (action.value) await setDestinationFromVoice(action.value);
                break;
            case 'status':
                speakNavigationStatus();
                break;
            case 'repeat':
                repeatLastInstruction();
                break;
            case 'call':
                triggerEmergency(action.value);
                break;
            case 'scene':
                updateOutput(sceneSummary);
                speakMessage(sceneSummary);
                break;
            default:
                break;
        }
    };

    const togglePreference = (key) => setSafetyOptions((prev) => ({ ...prev, [key]: !prev[key] }));
    const nextOnboardingStep = () => setCarouselIndex((prev) => (prev + 1) % onboardingSteps.length);
    const previousOnboardingStep = () => setCarouselIndex((prev) => (prev - 1 + onboardingSteps.length) % onboardingSteps.length);

    return (
        <div className="app-shell">
            <header className="hero-header">
                <div className="wave-bg" aria-hidden="true">
                    <span className="wave wave-one" />
                    <span className="wave wave-two" />
                    <span className="wave wave-three" />
                </div>
                <p className="hero-kicker">VisionGuide • Voice + Safety + AI</p>
                <h1 className="hero-title">Navigate with confidence.</h1>
                <p className="hero-subtitle">Real-time voice assistant for safe movement and emergency support.</p>
                <div className="hero-actions">
                    <button onClick={toggleVoiceListening} className={`voice-toggle ${isListening ? 'is-listening' : ''}`}>{isListening ? 'Listening' : 'Start voice'}</button>
                    <button className="outline-btn" onClick={() => speakMessage('Say assistant followed by your question to get help by audio.')}>How to use</button>
                    <button className="danger-btn" onClick={() => triggerEmergency('mother')}>Emergency</button>
                </div>
            </header>

            <main className="app-content">
                <section className="landing-card">
                    <h2>Your AI mobility companion</h2>
                    <p>{assistantResponse}</p>
                    <button className={`tap-speak-btn ${isListening ? 'listening' : ''}`} onClick={toggleVoiceListening}>{isListening ? 'Tap to Stop Listening' : 'Tap to Speak'}</button>

                    <div className="personality-card">
                        <div>
                            <h4>Assistant personality</h4>
                            <p>{personalityModes[personality].intro}</p>
                        </div>
                        <div className="personality-grid">
                            {Object.entries(personalityModes).map(([mode, config]) => (
                                <button
                                    key={mode}
                                    className={`personality-chip ${personality === mode ? 'active' : ''}`}
                                    onClick={() => changePersonality(mode)}
                                >
                                    {config.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="onboarding-card">
                        <h4>{onboardingSteps[carouselIndex].title}</h4>
                        <p>{onboardingSteps[carouselIndex].text}</p>
                        <div className="onboarding-controls">
                            <button className="outline-btn" onClick={previousOnboardingStep}>Previous</button>
                            <span>{carouselIndex + 1} / {onboardingSteps.length}</span>
                            <button className="outline-btn" onClick={nextOnboardingStep}>Next</button>
                        </div>
                    </div>

                    <p className="muted">Nearby: {nearbySummary}</p>
                    <div className="landing-tags">
                        <span>Live Location</span>
                        <span>Traffic Aware</span>
                        <span>Emergency Contacts</span>
                        <span>Audio First</span>
                    </div>
                </section>

                <section className="response-card">
                    <div className="response-header">
                        <h3>Live Output</h3>
                        <span>{isListening ? 'Voice On' : 'Waiting'}</span>
                    </div>
                    <p className="response-copy">{commandOutput}</p>
                    <article className={`result-card tone-${resultCard.tone}`}>
                        <p className="result-kicker">{personalityModes[personality].label}</p>
                        <h4>{resultCard.title}</h4>
                        <p>{resultCard.body}</p>
                        {resultCard.actions?.length > 0 && (
                            <div className="result-actions">
                                {resultCard.actions.map((action) => (
                                    <button
                                        key={`${action.kind}-${action.label}`}
                                        className="result-action-btn"
                                        onClick={() => activateQuickAction(action)}
                                    >
                                        {action.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </article>
                    {liveLocation && (
                        <div className="location-grid">
                            <div className="location-pill">
                                <span>Readable place</span>
                                <strong>{locationName || 'Ask for live location'}</strong>
                            </div>
                            <div className="location-pill">
                                <span>Latitude</span>
                                <strong>{liveLocation.lat.toFixed(5)}</strong>
                            </div>
                            <div className="location-pill">
                                <span>Longitude</span>
                                <strong>{liveLocation.lng.toFixed(5)}</strong>
                            </div>
                            <div className="location-pill">
                                <span>Accuracy</span>
                                <strong>{Math.round(liveLocation.accuracy || 0)} m</strong>
                            </div>
                            <div className="location-pill">
                                <span>Updated</span>
                                <strong>{locationUpdatedAt || 'Just now'}</strong>
                            </div>
                        </div>
                    )}
                </section>

                <section className="saved-places-card">
                    <div className="saved-places-header">
                        <h3>Saved Places</h3>
                        <p>Tap a bright shortcut to start a route fast.</p>
                    </div>
                    <div className="saved-places-grid">
                        {savedPlaces.map((place) => (
                            <button
                                key={place.key}
                                className={`saved-place-tile accent-${place.accent}`}
                                onClick={() => setDestinationFromVoice(place.destination)}
                            >
                                <span>{place.label}</span>
                                <strong>{place.destination}</strong>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="camera-card">
                    <CameraView onDetection={handleDetection} onAlert={handleAlert} />
                </section>

                <section className="preference-card">
                    <h3>Safe Route Preferences</h3>
                    <div className="switch-grid">
                        <button className={`pref-chip ${safetyOptions.avoidBusyRoutes ? 'on' : ''}`} onClick={() => togglePreference('avoidBusyRoutes')}>Avoid busy routes</button>
                        <button className={`pref-chip ${safetyOptions.avoidMountainous ? 'on' : ''}`} onClick={() => togglePreference('avoidMountainous')}>Avoid mountainous roads</button>
                        <button className={`pref-chip ${safetyOptions.avoidTolls ? 'on' : ''}`} onClick={() => togglePreference('avoidTolls')}>Avoid tolls</button>
                    </div>
                    <p className="muted">{navigationStatus?.trafficSummary || 'Traffic summary updates when route is active.'}</p>
                </section>

                <section className="cards-grid">
                    <article className="status-card">
                        <h3>Navigation</h3>
                        {isNavigating && navigationStatus ? (
                            <>
                                <p className="muted">Step {navigationStatus.currentStep} of {navigationStatus.totalSteps}</p>
                                <p className="highlight">{navigationStatus.currentInstruction}</p>
                                <p className="muted">{Math.round(navigationStatus.remainingDistance)}m left · ~{Math.round(navigationStatus.remainingDuration / 60)} min</p>
                            </>
                        ) : <p className="muted">Say: “navigate to [place]”.</p>}
                        {destination && <p className="chip">Destination: {destination}</p>}
                        {mapsUrl && <a className="maps-link" href={mapsUrl} target="_blank" rel="noreferrer">Open route in Google Maps</a>}
                    </article>

                    <article className="status-card">
                        <h3>Emergency Contacts</h3>
                        {Object.entries(emergencyContacts).map(([name, number]) => (
                            <p key={name} className="muted">{name}: {number}</p>
                        ))}
                        <button className="danger-btn" onClick={() => triggerEmergency('friend')}>Call Friend Now</button>
                    </article>
                </section>

                <section className="commands-card">
                    <h4>Things you can say</h4>
                    <div className="commands-grid">
                        <span>“live location”</span>
                        <span>“navigate to office”</span>
                        <span>“assistant what is traffic”</span>
                        <span>“nearest restroom”</span>
                        <span>“nearest hospital”</span>
                        <span>“call my mother”</span>
                        <span>“emergency”</span>
                    </div>
                </section>

                {voiceTranscript && (
                    <section className="transcript-card">
                        <p><strong>You said:</strong> {voiceTranscript}</p>
                    </section>
                )}
            </main>
        </div>
    );

    function toggleVoiceListening() {
        if (isListening) {
            voiceService.current.stopListening();
            setIsListening(false);
            speakMessage('Voice commands are now off.');
        } else {
            voiceService.current.startListening();
            setIsListening(true);
            speakMessage('Voice commands are on. Ask me anything using assistant command.');
        }
    }
}

export default App;
