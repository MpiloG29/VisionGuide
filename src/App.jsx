import { useState, useEffect, useRef, useCallback } from 'react';
import CameraView from './components/CameraView';
import NavigationService from './services/NavigationService';
import VoiceInputService from './services/VoiceInputService';
import './styles/App.css';

// ── Storage helpers ─────────────────────────────────────────
function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
}
function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

// ── Default empty structures (no hardcoded personal data) ───
const DEFAULT_CONTACTS = [];      // users add their own
const DEFAULT_PLACES   = [
    { key: 'home',   label: 'Home',   destination: '',  accent: 'accent-sunrise' },
    { key: 'work',   label: 'Work',   destination: '',  accent: 'accent-ocean'   },
    { key: 'clinic', label: 'Clinic', destination: '',  accent: 'accent-mint'    },
    { key: 'mall',   label: 'Mall',   destination: '',  accent: 'accent-sunset'  },
];

// ── Constants ───────────────────────────────────────────────
const ONBOARDING = [
    { title: 'Step 1: Tap to Speak',       text: 'Say "assistant" followed by any question, or tap the microphone button to begin voice commands.' },
    { title: 'Step 2: Real-Time Detection', text: 'Open the Camera tab. VisionGuide detects obstacles, traffic lights, people and scenarios in real time.' },
    { title: 'Step 3: Add Your Contacts',   text: 'Go to Safety → Emergency Contacts and add your family or friends so SOS can reach them instantly.' },
    { title: 'Step 4: Install on Phone',    text: 'Open Settings → Install. Add VisionGuide to your home screen — works offline with no app store.' },
];

const PERSONALITY_MODES = {
    calm:      { label: 'Calm Guide',  sub: 'Steady & supportive', rate: 0.88, pitch: 1.0  },
    energetic: { label: 'Energetic',   sub: 'Upbeat & fast',       rate: 1.1,  pitch: 1.15 },
    minimal:   { label: 'Minimal',     sub: 'Short & direct',      rate: 0.95, pitch: 0.95 },
};

const LANGUAGES = [
    { code: 'en-ZA', label: 'English (ZA)',  flag: '🇿🇦' },
    { code: 'en-US', label: 'English (US)',   flag: '🇺🇸' },
    { code: 'en-GB', label: 'English (UK)',   flag: '🇬🇧' },
    { code: 'zu-ZA', label: 'isiZulu',        flag: '🇿🇦' },
    { code: 'af-ZA', label: 'Afrikaans',      flag: '🇿🇦' },
    { code: 'fr-FR', label: 'Français',       flag: '🇫🇷' },
    { code: 'es-ES', label: 'Español',        flag: '🇪🇸' },
    { code: 'pt-BR', label: 'Português',      flag: '🇧🇷' },
    { code: 'ar-SA', label: 'العربية',        flag: '🇸🇦' },
    { code: 'sw',    label: 'Kiswahili',      flag: '🌍'  },
];

const REPORT_TYPES = [
    { value: 'pothole',  label: 'Pothole',         emoji: '🕳️', cls: 'pothole'  },
    { value: 'sidewalk', label: 'Broken Sidewalk',  emoji: '⚠️', cls: 'sidewalk' },
    { value: 'crossing', label: 'Unsafe Crossing',  emoji: '🚧', cls: 'crossing' },
    { value: 'light',    label: 'No Traffic Light', emoji: '🚦', cls: 'other'   },
    { value: 'obstacle', label: 'Blocked Path',     emoji: '🛑', cls: 'other'   },
    { value: 'other',    label: 'Other Hazard',     emoji: '📌', cls: 'other'   },
];

const TRAINING_SCENARIOS = [
    { id: 'kitchen',  emoji: '🍳', name: 'Kitchen Walk',   desc: 'Navigate counters & appliances', steps: ['Face the doorway', 'Walk forward 3 steps', 'Turn left at the counter', 'Reach the table safely'] },
    { id: 'crosswalk',emoji: '🚦', name: 'Crosswalk',      desc: 'Wait for green, cross safely',   steps: ['Stop at the kerb', 'Listen for the signal', 'Check both directions', 'Cross to the other side'] },
    { id: 'office',   emoji: '💼', name: 'Office Space',   desc: 'Move through a busy workspace',  steps: ['Enter through the door', 'Turn right past reception', 'Walk straight to your desk', 'Sit down safely'] },
    { id: 'shopping', emoji: '🛍️', name: 'Shopping Mall',  desc: 'Navigate a busy shopping area',  steps: ['Find the entrance', 'Follow the main corridor', 'Locate the lift', 'Reach your destination'] },
    { id: 'park',     emoji: '🌳', name: 'Park Path',      desc: 'Walk along a park footpath',     steps: ['Step onto the path', 'Walk straight ahead', 'Avoid the bench on the right', 'Reach the exit gate'] },
    { id: 'bus',      emoji: '🚌', name: 'Bus Stop',       desc: 'Board a bus safely',             steps: ['Approach the bus stop', 'Wait behind the line', 'Listen for the bus', 'Board from the front door'] },
];

const ACCENT_OPTIONS = ['accent-sunrise','accent-ocean','accent-mint','accent-sunset'];

// ── Weather helpers ─────────────────────────────────────────
const WEATHER_ICONS = { clear: '☀️', cloud: '⛅', fog: '🌫️', rain: '🌧️', snow: '❄️', storm: '⛈️', drizzle: '🌦️' };
function weatherIcon(code) {
    if (code === 0 || code === 1) return WEATHER_ICONS.clear;
    if (code <= 3)  return WEATHER_ICONS.cloud;
    if (code <= 48) return WEATHER_ICONS.fog;
    if (code <= 57) return WEATHER_ICONS.drizzle;
    if (code <= 67) return WEATHER_ICONS.rain;
    if (code <= 77) return WEATHER_ICONS.snow;
    if (code <= 82) return WEATHER_ICONS.rain;
    if (code <= 86) return WEATHER_ICONS.snow;
    return WEATHER_ICONS.storm;
}

// ── SVG Icons ───────────────────────────────────────────────
const Icon = {
    Home:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    Camera:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
    Navigate: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>,
    Shield:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    Settings: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    Mic:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
    MicOff:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
    Eye:      () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>,
    Location: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
    Map:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>,
    Users:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    Phone:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.1 6.1l.9-.9a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
    Share:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
    Alert:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    Building: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/></svg>,
    GamePad:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="17" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/></svg>,
    Edit:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    Trash:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
    Plus:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    Download: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    Wifi:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>,
    WifiOff:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>,
    Wind:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>,
    Check:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
    Report:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
};

// ── Toggle component ─────────────────────────────────────────
function Toggle({ checked, onChange }) {
    return (
        <label className="toggle-switch">
            <input type="checkbox" checked={checked} onChange={onChange} />
            <span className="toggle-slider" />
        </label>
    );
}

// ── Input style ──────────────────────────────────────────────
const inputStyle = { width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.875rem', outline: 'none' };

// ════════════════════════════════════════════════════════════
// APP
// ════════════════════════════════════════════════════════════
function App() {
    // ── Navigation tabs
    const [activeTab, setActiveTab] = useState('home');

    // ── Voice
    const [isListening,    setIsListening]    = useState(false);
    const [voiceTranscript, setVoiceTranscript] = useState('');
    const [assistantMsg,   setAssistantMsg]   = useState('Tap the microphone or say "assistant" to begin.');
    const [resultCard,     setResultCard]     = useState({ title: 'Ready', body: 'Use voice or tap a shortcut to get started.', tone: 'info', actions: [] });

    // ── Location
    const [liveLocation,    setLiveLocation]    = useState(null);
    const [locationUpdated, setLocationUpdated] = useState('');
    const [currentAddress,  setCurrentAddress]  = useState('');
    const [locationError,   setLocationError]   = useState('');

    // ── Navigation
    const [destination,      setDestination]      = useState('');
    const [isNavigating,     setIsNavigating]     = useState(false);
    const [navigationStatus, setNavigationStatus] = useState(null);
    const [mapsUrl,          setMapsUrl]          = useState('');
    const [navError,         setNavError]         = useState('');
    const [safetyOptions,    setSafetyOptions]    = useState(() => load('vg-safety', { avoidBusyRoutes: true, avoidMountainous: true, avoidTolls: true }));
    const [indoorMode,       setIndoorMode]       = useState(false);

    // ── Saved places (user-editable, localStorage)
    const [savedPlaces, setSavedPlaces] = useState(() => load('vg-places', DEFAULT_PLACES));
    const [editingPlace, setEditingPlace] = useState(null); // { index, label, destination, accent }

    // ── Learned routes (real usage tracking)
    const [learnedRoutes, setLearnedRoutes] = useState(() => load('vg-routes', []));

    // ── Camera / detection
    const [detectedObjects, setDetectedObjects] = useState([]);
    const [sceneSummary,    setSceneSummary]    = useState('Warming up camera and scanning surroundings.');
    const [contextScenario, setContextScenario] = useState(null);
    const [requestedItem,   setRequestedItem]   = useState('');
    const [hazardCount,     setHazardCount]     = useState(0);
    const [lastAlert,       setLastAlert]       = useState(null); // eslint-disable-line no-unused-vars

    // ── Emergency contacts (user-editable, localStorage — no hardcoded numbers)
    const [contacts,     setContacts]     = useState(() => load('vg-contacts', DEFAULT_CONTACTS));
    const [editContact,  setEditContact]  = useState(null);   // { index, name, phone }
    const [newContact,   setNewContact]   = useState({ name: '', phone: '' });
    const [showAddContact, setShowAddContact] = useState(false);
    const [emergencyActive, setEmergencyActive] = useState(false);

    // ── Community reports
    const [communityReports, setCommunityReports] = useState(() => load('vg-reports', []));
    const [newReport,       setNewReport]       = useState({ type: 'pothole', note: '' });
    const [showReportForm,  setShowReportForm]  = useState(false);

    // ── Weather & Air Quality (real APIs — no mocks)
    const [weather,     setWeather]     = useState(null);
    const [airQuality,  setAirQuality]  = useState(null);
    const [weatherLoading, setWeatherLoading] = useState(false);
    const lastWeatherFetch = useRef(0);

    // ── Voice profile & language
    const [personality,       setPersonality]       = useState(() => load('vg-personality', 'calm'));
    const [voiceSpeed,        setVoiceSpeed]        = useState(() => load('vg-speed', 0.95));
    const [selectedVoiceName, setSelectedVoiceName] = useState(() => load('vg-voice', ''));
    const [availableVoices,   setAvailableVoices]   = useState([]);
    const [selectedLanguage,  setSelectedLanguage]  = useState(() => load('vg-lang', 'en-ZA'));

    // ── Haptic
    const [hapticEnabled, setHapticEnabled] = useState(() => load('vg-haptic', true));

    // ── Training
    const [trainingMode,     setTrainingMode]     = useState(false);
    const [trainingScenario, setTrainingScenario] = useState(null);
    const [trainingStep,     setTrainingStep]     = useState(0);

    // ── PWA install
    const [showInstallBanner, setShowInstallBanner] = useState(false);
    const deferredPromptRef = useRef(null);

    // ── Misc UI
    const [onboardingIndex, setOnboardingIndex] = useState(0);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    // ── Services
    const navSvc   = useRef(new NavigationService());
    const voiceSvc = useRef(new VoiceInputService());
    const lastSceneSpeechAt = useRef(0);

    // ════════════════════════════════════════════════════════
    // BOOT
    // ════════════════════════════════════════════════════════
    useEffect(() => {
        // Voice service — set language before init
        voiceSvc.current.init(selectedLanguage);
        voiceSvc.current.onCommand(handleVoiceCommand);
        voiceSvc.current.onTranscript(t => setVoiceTranscript(t));

        // Load system voices
        const loadVoices = () => setAvailableVoices(window.speechSynthesis?.getVoices() || []);
        window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
        loadVoices();

        // GPS tracking
        navSvc.current.startLocationTracking(async (pos) => {
            if (!pos) {
                setLocationError(navSvc.current.locationError || 'Location unavailable.');
                return;
            }
            setLocationError('');
            setLiveLocation(pos);
            setLocationUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            if (isNavigating) setNavigationStatus(navSvc.current.getStatus());

            // Reverse geocode (throttled to once per 30 s)
            if (!lastWeatherFetch._geoAt || Date.now() - lastWeatherFetch._geoAt > 30000) {
                lastWeatherFetch._geoAt = Date.now();
                const addr = await navSvc.current.reverseGeocode(pos.lat, pos.lng);
                if (addr) setCurrentAddress(addr.short);
            }

            // Fetch weather + air quality (throttled to once per 10 min)
            if (Date.now() - lastWeatherFetch.current > 600000) {
                lastWeatherFetch.current = Date.now();
                fetchEnvironmentData();
            }
        });

        navSvc.current.onArrival(() => {
            setIsNavigating(false);
            setDestination('');
            setMapsUrl('');
            speakMessage('You have arrived at your destination. Great job!');
        });

        // Connectivity
        const onOnline  = () => { setIsOffline(false); updateOutput('Connection restored. Live features are back online.'); };
        const onOffline = () => { setIsOffline(true);  updateOutput('You are offline. Camera, voice, and saved routes still work.'); };
        window.addEventListener('online',  onOnline);
        window.addEventListener('offline', onOffline);

        // PWA install prompt
        const onInstallPrompt = (e) => { e.preventDefault(); deferredPromptRef.current = e; setShowInstallBanner(true); };
        window.addEventListener('beforeinstallprompt', onInstallPrompt);

        // Service worker
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

        // Welcome message (after 1 s)
        const t = setTimeout(() => speakMessage('Welcome to VisionGuide. I can guide you, detect obstacles, check the weather, and call for help by voice.'), 1000);

        const nav = navSvc.current;
        const voice = voiceSvc.current;
        return () => {
            clearTimeout(t);
            window.removeEventListener('online',  onOnline);
            window.removeEventListener('offline', onOffline);
            window.removeEventListener('beforeinstallprompt', onInstallPrompt);
            window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
            nav.stopLocationTracking();
            voice.stopListening();
            window.speechSynthesis?.cancel();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Sync language to voice service
    useEffect(() => { voiceSvc.current.setLanguage(selectedLanguage); }, [selectedLanguage]);

    // ════════════════════════════════════════════════════════
    // REAL DATA FETCHERS
    // ════════════════════════════════════════════════════════
    async function fetchEnvironmentData() {
        setWeatherLoading(true);
        const [w, aq] = await Promise.all([navSvc.current.getWeather(), navSvc.current.getAirQuality()]);
        setWeather(w);
        setAirQuality(aq);
        setWeatherLoading(false);

        // Auto-announce weather alerts
        const allAlerts = [...(w?.alerts || []), ...(aq?.alert ? [aq.alert] : [])];
        if (allAlerts.length > 0) {
            allAlerts.forEach(a => speakMessage(a));
            updateOutput(allAlerts[0]);
        }
    }

    // ════════════════════════════════════════════════════════
    // SPEECH
    // ════════════════════════════════════════════════════════
    const speakMessage = useCallback((text) => {
        if (!text || !('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const utt   = new SpeechSynthesisUtterance(text);
        utt.lang    = selectedLanguage;
        utt.rate    = voiceSpeed;
        utt.pitch   = PERSONALITY_MODES[personality]?.pitch || 1.0;
        if (selectedVoiceName) {
            const v = availableVoices.find(x => x.name === selectedVoiceName);
            if (v) utt.voice = v;
        }
        window.speechSynthesis.speak(utt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedLanguage, voiceSpeed, personality, selectedVoiceName, availableVoices]);

    function applyStyle(msg) {
        if (!msg) return msg;
        if (personality === 'energetic') return `${msg} You've got this!`;
        if (personality === 'minimal')   return msg.split('. ')[0] + '.';
        return msg;
    }

    function updateOutput(msg) { setAssistantMsg(applyStyle(msg)); }
    function updateCard(card)  { setResultCard(prev => ({ ...prev, ...card })); }

    // ════════════════════════════════════════════════════════
    // VOICE COMMANDS
    // ════════════════════════════════════════════════════════
    async function handleVoiceCommand(cmd, params) {
        switch (cmd) {
            case 'navigate':
                if (params?.destination) await navigateTo(params.destination);
                else speakMessage('Where would you like to go? Say navigate to, followed by your destination.');
                break;
            case 'find':
                if (params?.item) { setRequestedItem(params.item); setActiveTab('camera'); speakMessage(`Looking for ${params.item} in your surroundings.`); }
                else speakMessage('What do you want me to find?');
                break;
            case 'nearbyRestroom':  await findNearby('restroom');  break;
            case 'nearbyMall':      await findNearby('mall');      break;
            case 'nearbyHospital':  await findNearby('hospital');  break;
            case 'nearbyPharmacy':  await findNearby('pharmacy');  break;
            case 'nearbyPolice':    await findNearby('police');    break;
            case 'nearbyFood':      await findNearby('food');      break;
            case 'nearbyBank':      await findNearby('bank');      break;
            case 'nearbyTransport': await findNearby('transport'); break;
            case 'nearbyHelp':      await findNearby('help');      break;
            case 'emergency':       triggerEmergency();             break;
            case 'call':            triggerCallContact(params?.contact); break;
            case 'assistant':       await handleAssistantQuery(params?.question); break;
            case 'weather':         await handleWeatherQuery();     break;
            case 'airquality':      handleAirQualityQuery();        break;
            case 'see':
                updateOutput(sceneSummary);
                speakMessage(sceneSummary);
                break;
            case 'stop':
                stopNavigation();
                speakMessage('Navigation stopped.');
                break;
            case 'where':   speakLocation();  break;
            case 'status':  speakNavStatus(); break;
            case 'repeat':  repeatLast();     break;
            case 'help':    speakHelp();      break;
            default: break;
        }
    }

    async function handleAssistantQuery(q) {
        const question = (q || '').toLowerCase();
        if (!question) { speakMessage('Please ask a question after saying assistant.'); return; }
        if (question.includes('weather'))       { await handleWeatherQuery(); return; }
        if (question.includes('air'))           { handleAirQualityQuery();   return; }
        if (question.includes('where') || question.includes('location')) { speakLocation(); return; }
        if (question.includes('traffic'))       { speakMessage(navSvc.current.lastTrafficSummary || 'No live traffic data available.'); return; }
        if (question.includes('nearest') || question.includes('close by')) { await findNearby('help'); return; }
        if (question.includes('see') || question.includes('around')) { speakMessage(sceneSummary); return; }
        const fallback = 'I can help with navigation, weather, air quality, nearby places, obstacle detection, and emergency contacts.';
        updateOutput(fallback);
        speakMessage(fallback);
    }

    async function handleWeatherQuery() {
        if (!liveLocation) { speakMessage('Still getting your location. Please wait a moment.'); return; }
        if (!weather) {
            await fetchEnvironmentData();
            return;
        }
        const msg = `Current weather: ${weather.condition}. Temperature ${weather.temperature} degrees. Wind ${weather.windspeed} kilometres per hour.`;
        updateOutput(msg);
        updateCard({ title: 'Live Weather', body: msg, tone: weather.alerts.length > 0 ? 'warning' : 'info', actions: [] });
        speakMessage(msg);
        weather.alerts.forEach(a => setTimeout(() => speakMessage(a), 2000));
    }

    function handleAirQualityQuery() {
        if (!airQuality) { speakMessage('Air quality data is loading. Please try again shortly.'); return; }
        const msg = `Air quality is ${airQuality.level}. European AQI index is ${airQuality.aqi}. PM2.5 is ${airQuality.pm25} micrograms per cubic metre.`;
        updateOutput(msg);
        updateCard({ title: 'Air Quality', body: msg, tone: airQuality.aqi > 60 ? 'warning' : 'info', actions: [] });
        speakMessage(msg);
        if (airQuality.alert) setTimeout(() => speakMessage(airQuality.alert), 1500);
    }

    // ════════════════════════════════════════════════════════
    // NAVIGATION
    // ════════════════════════════════════════════════════════
    async function navigateTo(dest) {
        if (!dest?.trim()) return;
        setNavError('');
        setDestination(dest);
        updateOutput(`Looking up route to ${dest}…`);
        speakMessage(`Setting destination to ${dest}. Please wait.`);

        try {
            const route = await navSvc.current.calculateRoute(dest, safetyOptions);
            navSvc.current.startNavigation();
            setIsNavigating(true);
            setMapsUrl(route.googleMapsUrl);
            const msg = `Route found to ${dest}. ${route.routeProfile}`;
            updateOutput(msg);
            updateCard({
                title: `Route to ${dest}`,
                body:  `${(route.totalDistance / 1000).toFixed(1)} km · ~${Math.round(route.totalDuration / 60)} min`,
                tone:  'celebrate',
                actions: [{ label: 'Open Maps', kind: 'open-maps', value: route.googleMapsUrl }],
            });
            speakMessage(`Route found. ${route.routeProfile} Opening Google Maps now.`);
            window.open(route.googleMapsUrl, '_blank', 'noopener,noreferrer');
            setNavigationStatus(navSvc.current.getStatus());
            learnRoute(dest);
        } catch (err) {
            const msg = err.message || 'Could not find a route. Please check your destination.';
            setNavError(msg);
            updateOutput(msg);
            speakMessage(msg);
        }
    }

    async function findNearby(type) {
        updateOutput(`Searching for nearby ${type}…`);
        speakMessage(`Searching for nearby ${type}.`);
        try {
            const result = await navSvc.current.findNearby(type);
            updateOutput(result.announcement);
            updateCard({ title: `Nearby ${type}`, body: result.announcement, tone: 'info', actions: result.googleMapsUrl ? [{ label: 'Open in Maps', kind: 'open-maps', value: result.googleMapsUrl }] : [] });
            speakMessage(result.announcement);
            if (result.googleMapsUrl) window.open(result.googleMapsUrl, '_blank', 'noopener,noreferrer');
        } catch {
            speakMessage(`Could not find nearby ${type} right now.`);
        }
    }

    function stopNavigation() {
        navSvc.current.stopNavigation();
        setIsNavigating(false);
        setDestination('');
        setMapsUrl('');
        setNavError('');
    }

    function speakLocation() {
        const pos = navSvc.current.currentPosition;
        if (!pos) { speakMessage('Still getting your location. Please wait.'); return; }
        const addr = currentAddress ? `You are on ${currentAddress}.` : `Latitude ${pos.lat.toFixed(4)}, longitude ${pos.lng.toFixed(4)}.`;
        const acc  = pos.accuracy ? ` GPS accuracy is ${Math.round(pos.accuracy)} metres.` : '';
        updateOutput(addr + acc);
        speakMessage(addr + acc);
        setMapsUrl(`https://www.google.com/maps/search/?api=1&query=${pos.lat},${pos.lng}`);
    }

    function speakNavStatus() {
        const s = navSvc.current.getStatus();
        if (s.isNavigating) speakMessage(`Step ${s.currentStep} of ${s.totalSteps}. ${Math.round(s.remainingDistance)} metres remaining.`);
        else speakMessage('You are not navigating right now.');
    }

    function repeatLast() {
        const s = navSvc.current.getStatus();
        if (s.isNavigating && s.currentInstruction) speakMessage(s.currentInstruction);
        else speakMessage('No active instruction to repeat.');
    }

    function speakHelp() {
        speakMessage('You can say: navigate to a place, nearest restroom, nearest hospital, weather, air quality, where am I, emergency, call my contact, what do you see, status, or assistant followed by your question.');
    }

    // ════════════════════════════════════════════════════════
    // EMERGENCY — uses real contacts from localStorage
    // ════════════════════════════════════════════════════════
    function triggerEmergency() {
        if (contacts.length === 0) {
            speakMessage('No emergency contacts saved. Please go to Safety and add a contact first.');
            setActiveTab('safety');
            return;
        }
        setEmergencyActive(true);
        speakMessage('Emergency mode active. Contacting your emergency contacts now.');
        if (hapticEnabled && 'vibrate' in navigator) navigator.vibrate([500, 200, 500, 200, 500]);
        // Call the first contact automatically
        window.location.href = `tel:${contacts[0].phone}`;
    }

    function triggerCallContact(nameOrIndex) {
        const contact = contacts.find(c => c.name.toLowerCase().includes((nameOrIndex || '').toLowerCase())) || contacts[0];
        if (!contact) { speakMessage('No emergency contacts saved. Please add one in the Safety tab.'); return; }
        window.location.href = `tel:${contact.phone}`;
    }

    function shareLocationSMS(contact) {
        const pos  = navSvc.current.currentPosition;
        const link = pos ? `https://maps.google.com/?q=${pos.lat},${pos.lng}` : 'Location unavailable';
        const body = encodeURIComponent(`🆘 EMERGENCY — I need help!\nMy location: ${link}\nPlease call me back or come to me.`);
        window.open(`sms:${contact.phone}?body=${body}`);
    }

    // ════════════════════════════════════════════════════════
    // CONTACTS (user-managed — stored in localStorage)
    // ════════════════════════════════════════════════════════
    function saveContacts(updated) {
        setContacts(updated);
        save('vg-contacts', updated);
    }

    function addContact() {
        if (!newContact.name.trim() || !newContact.phone.trim()) return;
        const updated = [...contacts, { name: newContact.name.trim(), phone: newContact.phone.trim() }];
        saveContacts(updated);
        setNewContact({ name: '', phone: '' });
        setShowAddContact(false);
        speakMessage(`${newContact.name} added to emergency contacts.`);
    }

    function deleteContact(i) {
        const updated = contacts.filter((_, idx) => idx !== i);
        saveContacts(updated);
    }

    function saveEditedContact() {
        if (!editContact) return;
        const updated = contacts.map((c, i) => i === editContact.index ? { name: editContact.name, phone: editContact.phone } : c);
        saveContacts(updated);
        setEditContact(null);
    }

    // ════════════════════════════════════════════════════════
    // SAVED PLACES (user-managed — stored in localStorage)
    // ════════════════════════════════════════════════════════
    function savePlaces(updated) {
        setSavedPlaces(updated);
        save('vg-places', updated);
    }

    function saveEditedPlace() {
        if (!editingPlace) return;
        const updated = savedPlaces.map((p, i) => i === editingPlace.index ? { ...p, label: editingPlace.label, destination: editingPlace.destination, accent: editingPlace.accent } : p);
        savePlaces(updated);
        setEditingPlace(null);
    }

    function addPlace() {
        const updated = [...savedPlaces, { key: `place-${Date.now()}`, label: 'New Place', destination: '', accent: ACCENT_OPTIONS[0] }];
        savePlaces(updated);
        setEditingPlace({ index: updated.length - 1, label: 'New Place', destination: '', accent: ACCENT_OPTIONS[0] });
    }

    function deletePlace(i) {
        savePlaces(savedPlaces.filter((_, idx) => idx !== i));
    }

    // ════════════════════════════════════════════════════════
    // LEARNING — real route frequency tracking
    // ════════════════════════════════════════════════════════
    function learnRoute(dest) {
        const existing = learnedRoutes.find(r => r.destination.toLowerCase() === dest.toLowerCase());
        let updated;
        if (existing) {
            updated = learnedRoutes.map(r => r.destination.toLowerCase() === dest.toLowerCase() ? { ...r, count: r.count + 1, lastUsed: new Date().toLocaleDateString() } : r);
        } else {
            updated = [{ destination: dest, count: 1, lastUsed: new Date().toLocaleDateString() }, ...learnedRoutes].slice(0, 10);
        }
        setLearnedRoutes(updated);
        save('vg-routes', updated);
    }

    // ════════════════════════════════════════════════════════
    // COMMUNITY REPORTS
    // ════════════════════════════════════════════════════════
    function submitReport() {
        if (!newReport.note.trim()) return;
        const pos = navSvc.current.currentPosition;
        const report = { id: Date.now(), ...newReport, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), lat: pos?.lat || null, lng: pos?.lng || null, address: currentAddress || '' };
        const updated = [report, ...communityReports].slice(0, 50);
        setCommunityReports(updated);
        save('vg-reports', updated);
        setNewReport({ type: 'pothole', note: '' });
        setShowReportForm(false);
        speakMessage('Hazard report saved. Thank you for helping keep the area safe.');
    }

    // ════════════════════════════════════════════════════════
    // TRAINING
    // ════════════════════════════════════════════════════════
    function startTraining(scenario) {
        setTrainingScenario(scenario);
        setTrainingStep(0);
        setTrainingMode(true);
        speakMessage(`Starting ${scenario.name} training. ${scenario.steps[0]}`);
    }

    function nextTrainingStep() {
        if (!trainingScenario) return;
        const next = trainingStep + 1;
        if (next >= trainingScenario.steps.length) {
            speakMessage(`Excellent! ${trainingScenario.name} training complete. You did great!`);
            setTrainingMode(false); setTrainingScenario(null); setTrainingStep(0);
        } else {
            setTrainingStep(next);
            speakMessage(trainingScenario.steps[next]);
        }
    }

    // ════════════════════════════════════════════════════════
    // CAMERA / DETECTION
    // ════════════════════════════════════════════════════════
    function detectContextScenario(objects) {
        const cls = objects.map(o => o.class);
        const count = (c) => cls.filter(x => x === c).length;
        const has   = (...items) => items.some(i => cls.includes(i));
        if (has('traffic light') && has('person','car','bus','truck')) return { id: 'crosswalk', label: 'Crosswalk Ahead', icon: '🚦' };
        if (count('person') >= 4)                                      return { id: 'crowd',     label: 'Crowded Area',   icon: '👥' };
        if (has('car','truck','bus') && count('car')+count('bus') >= 2) return { id: 'road',     label: 'Busy Road',      icon: '🚗' };
        if (has('dining table','cup','bottle','bowl'))                  return { id: 'kitchen',  label: 'Dining Area',    icon: '🍽️' };
        if (has('dog'))                                                  return { id: 'pet',      label: 'Animal Nearby',  icon: '🐕' };
        if (has('bicycle'))                                              return { id: 'cycle',    label: 'Cyclist',        icon: '🚲' };
        if (has('stop sign'))                                            return { id: 'stop',     label: 'Stop Sign',      icon: '🛑' };
        if (has('bench'))                                                return { id: 'outdoor',  label: 'Outdoor Area',   icon: '🌳' };
        if (has('suitcase','backpack','handbag') && has('person'))       return { id: 'shop',     label: 'Shopping Area',  icon: '🛍️' };
        if (has('chair') && count('chair') >= 2)                        return { id: 'office',   label: 'Office/Waiting', icon: '💼' };
        return null;
    }

    function buildSceneSummary(detections) {
        if (!detections?.length) return 'No major obstacles detected. Your immediate path appears clear.';
        const grouped = detections.reduce((acc, d) => { acc[d.class] = (acc[d.class] || 0) + 1; return acc; }, {});
        const top     = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${c > 1 ? c + ' ' : ''}${n}${c > 1 ? 's' : ''}`).join(', ');
        const scenario = detectContextScenario(detections);
        const prefix  = scenario ? { crosswalk: "You're approaching a crosswalk.", crowd: "You're in a crowded area.", road: "There is a busy road ahead.", kitchen: "You appear to be in a dining or kitchen area.", pet: "There is an animal nearby.", cycle: "A cyclist is in the area.", stop: "A stop sign is ahead.", outdoor: "You're in an outdoor area.", shop: "You're in a shopping area.", office: "You're in an office or waiting area." }[scenario.id] || '' : '';
        const tl = detections.find(d => d.class === 'traffic light') ? ' Traffic light detected.' : '';
        if (requestedItem) {
            const found = detections.some(d => d.class.toLowerCase().includes(requestedItem.toLowerCase()));
            return `${prefix} I can see ${top}.${tl} ${found ? `Found your ${requestedItem}.` : `Still searching for ${requestedItem}.`}`.trim();
        }
        return `${prefix} I can see ${top} around you.${tl}`.trim();
    }

    const handleDetection = useCallback((detections) => {
        setDetectedObjects(detections || []);
        setHazardCount((detections || []).filter(d => ['person','car','truck','bus','motorcycle','bicycle','traffic light','stop sign','dog'].includes(d.class)).length);
        const summary  = buildSceneSummary(detections);
        const scenario = detectContextScenario(detections || []);
        setSceneSummary(summary);
        setContextScenario(scenario);
        if (detections?.length) setLastAlert({ object: detections[0].class, confidence: Math.round(detections[0].score * 100) });
        const now = Date.now();
        if (requestedItem && now - lastSceneSpeechAt.current > 8000) {
            if ((detections || []).some(d => d.class.toLowerCase().includes(requestedItem.toLowerCase()))) {
                speakMessage(`Found your ${requestedItem}.`);
                lastSceneSpeechAt.current = now;
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestedItem, speakMessage]);

    const handleAlert = useCallback((alertMsg) => {
        setLastAlert({ message: alertMsg });
        updateOutput(alertMsg);
        updateCard({ title: 'Safety Alert', body: alertMsg, tone: 'danger', actions: [{ label: 'My location', kind: 'location' }] });
        speakMessage(alertMsg);
        if (hapticEnabled && 'vibrate' in navigator) navigator.vibrate([200, 100, 200]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hapticEnabled, speakMessage]);

    // ════════════════════════════════════════════════════════
    // QUICK ACTIONS
    // ════════════════════════════════════════════════════════
    async function activateQuickAction(action) {
        switch (action.kind) {
            case 'location':    speakLocation();                                 break;
            case 'restroom':    await findNearby('restroom');                    break;
            case 'mall':        await findNearby('mall');                        break;
            case 'help':        await findNearby('help');                        break;
            case 'open-maps':   if (action.value) window.open(action.value, '_blank', 'noopener,noreferrer'); break;
            case 'saved-place': if (action.value) await navigateTo(action.value); break;
            case 'status':      speakNavStatus();                                break;
            case 'repeat':      repeatLast();                                    break;
            case 'call':        triggerCallContact(action.value);                break;
            case 'scene':       updateOutput(sceneSummary); speakMessage(sceneSummary); break;
            default:            break;
        }
    }

    // ════════════════════════════════════════════════════════
    // VOICE & SETTINGS
    // ════════════════════════════════════════════════════════
    function toggleVoice() {
        if (isListening) {
            voiceSvc.current.stopListening();
            setIsListening(false);
            speakMessage('Voice commands off.');
        } else {
            voiceSvc.current.startListening();
            setIsListening(true);
            speakMessage('Voice commands on. Say assistant followed by your question.');
        }
    }

    function changePersonality(mode) { setPersonality(mode); save('vg-personality', mode); }
    function changeSpeed(val)        { setVoiceSpeed(val);   save('vg-speed',       val);  }
    function changeVoice(name)       { setSelectedVoiceName(name); save('vg-voice', name); setTimeout(() => speakMessage('Voice updated. How does this sound?'), 100); }
    function changeLanguage(code)    { setSelectedLanguage(code);  save('vg-lang',  code); setTimeout(() => speakMessage(`Language changed to ${LANGUAGES.find(l => l.code === code)?.label}.`), 100); }
    function toggleHaptic(val)       { setHapticEnabled(val); save('vg-haptic', val); if (val && 'vibrate' in navigator) navigator.vibrate([100,50,100]); }
    function toggleSafety(key)       { setSafetyOptions(prev => { const n = { ...prev, [key]: !prev[key] }; save('vg-safety', n); return n; }); }

    async function handleInstall() {
        if (!deferredPromptRef.current) return;
        deferredPromptRef.current.prompt();
        const { outcome } = await deferredPromptRef.current.userChoice;
        if (outcome === 'accepted') setShowInstallBanner(false);
        deferredPromptRef.current = null;
    }

    // ════════════════════════════════════════════════════════
    // WEATHER CARD (reusable)
    // ════════════════════════════════════════════════════════
    function WeatherCard() {
        if (!liveLocation) return null;
        if (weatherLoading) return (
            <div className="card scene-card mt-md" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div className="spinner" />
                <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Fetching live weather…</span>
            </div>
        );
        if (!weather) return (
            <div className="card mt-md" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Weather not loaded yet.</span>
                <button className="btn btn-ghost btn-sm" onClick={fetchEnvironmentData}>Fetch</button>
            </div>
        );

        const hasAlert = weather.alerts.length > 0 || (airQuality?.aqi > 60);
        return (
            <div className={`card mt-md ${hasAlert ? '' : 'scene-card'}`} style={hasAlert ? { background: 'rgba(255,187,53,0.08)', borderColor: 'rgba(255,187,53,0.2)' } : {}}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '2rem' }}>{weatherIcon(weather.weathercode)}</span>
                        <div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)' }}>{weather.temperature}°C</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{weather.condition}</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Wind</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>{weather.windspeed} km/h</div>
                        </div>
                        {airQuality && (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AQI</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: airQuality.aqi > 60 ? 'var(--amber)' : 'var(--green)' }}>{airQuality.level}</div>
                            </div>
                        )}
                    </div>
                </div>
                {weather.alerts.map((a, i) => (
                    <div key={i} style={{ marginTop: '0.65rem', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'rgba(255,187,53,0.12)', border: '1px solid rgba(255,187,53,0.25)', fontSize: '0.8rem', color: 'var(--amber)', display: 'flex', gap: '0.5rem' }}>
                        <span>⚠️</span>{a}
                    </div>
                ))}
                {airQuality?.alert && (
                    <div style={{ marginTop: '0.45rem', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'rgba(255,59,85,0.1)', border: '1px solid rgba(255,59,85,0.2)', fontSize: '0.8rem', color: 'var(--red)', display: 'flex', gap: '0.5rem' }}>
                        <span>🏭</span>{airQuality.alert}
                    </div>
                )}
            </div>
        );
    }

    // ════════════════════════════════════════════════════════
    // TAB: HOME
    // ════════════════════════════════════════════════════════
    function renderHome() {
        return (
            <>
                {showInstallBanner && (
                    <div className="install-banner">
                        <div><strong>Install VisionGuide</strong><p>Add to your home screen for full offline access.</p></div>
                        <button className="btn btn-primary btn-sm" onClick={handleInstall}>Install</button>
                    </div>
                )}

                {trainingMode && trainingScenario && (
                    <div className="training-banner">
                        <div className="row between">
                            <span className="card-kicker">Training — {trainingScenario.name}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{trainingStep + 1}/{trainingScenario.steps.length}</span>
                        </div>
                        <p style={{ margin: '0.5rem 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{trainingScenario.steps[trainingStep]}</p>
                        <div className="training-progress"><div className="training-progress-bar" style={{ width: `${((trainingStep + 1) / trainingScenario.steps.length) * 100}%` }} /></div>
                        <div className="row mt-sm" style={{ gap: '0.5rem' }}>
                            <button className="btn btn-primary" style={{ flex: 1 }} onClick={nextTrainingStep}>{trainingStep + 1 >= trainingScenario.steps.length ? '🎉 Finish' : 'Next Step'}</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setTrainingMode(false); setTrainingScenario(null); }}>Cancel</button>
                        </div>
                    </div>
                )}

                {/* Voice hero */}
                <div className="card voice-hero">
                    <h2>Navigate with confidence</h2>
                    <p>{assistantMsg}</p>
                    <button className={`voice-btn ${isListening ? 'listening' : ''}`} onClick={toggleVoice} aria-label={isListening ? 'Stop listening' : 'Start voice'}>
                        {isListening ? <Icon.MicOff /> : <Icon.Mic />}
                        {isListening ? 'Listening…' : 'Tap to Speak'}
                    </button>
                    <div className="tag-row" style={{ justifyContent: 'center' }}>
                        <span className="tag">Live GPS</span><span className="tag">Real Weather</span><span className="tag">AI Detection</span><span className="tag">Offline Ready</span>
                    </div>
                </div>

                {/* Location strip */}
                {(liveLocation || locationError) && (
                    <div className="card mt-md" style={{ padding: '0.75rem 1rem' }}>
                        {locationError ? (
                            <div style={{ color: 'var(--red)', fontSize: '0.82rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <Icon.Alert /> {locationError}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ color: 'var(--teal)', width: 16, height: 16, display: 'flex' }}><Icon.Location /></span>
                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>{currentAddress || `${liveLocation?.lat?.toFixed(4)}, ${liveLocation?.lng?.toFixed(4)}`}</span>
                                </div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>{locationUpdated}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Live weather (real Open-Meteo data) */}
                <WeatherCard />

                {/* Scene summary */}
                <div className="card scene-card mt-md">
                    <span className="card-kicker">AI Scene Summary</span>
                    {contextScenario && <div className="scene-scenario"><span>{contextScenario.icon}</span>{contextScenario.label}</div>}
                    <p className="scene-text">{sceneSummary}</p>
                    {detectedObjects.length > 0 && (
                        <div className="scene-objects">
                            {[...new Set(detectedObjects.map(d => d.class))].slice(0, 8).map(cls => {
                                const danger  = ['car','truck','bus','motorcycle','person','dog','traffic light'].includes(cls);
                                const isTarget = requestedItem && cls.toLowerCase().includes(requestedItem.toLowerCase());
                                return <span key={cls} className={`scene-pill ${isTarget ? 'target' : danger ? 'hazard' : 'safe'}`}>{cls}</span>;
                            })}
                        </div>
                    )}
                </div>

                {/* Quick actions */}
                <div className="card mt-md">
                    <span className="card-kicker">Quick Actions</span>
                    <div className="quick-grid mt-sm">
                        <button className="quick-btn blue" onClick={speakLocation}><Icon.Location /><span className="quick-btn-label">My Location</span><span className="quick-btn-sub">{currentAddress ? currentAddress.split(',')[0] : 'Live GPS'}</span></button>
                        <button className="quick-btn teal" onClick={() => findNearby('restroom')}><Icon.Map /><span className="quick-btn-label">Restroom</span><span className="quick-btn-sub">Find nearest</span></button>
                        <button className="quick-btn orange" onClick={() => findNearby('help')}><Icon.Users /><span className="quick-btn-label">Nearby Help</span><span className="quick-btn-sub">Hospital / clinic</span></button>
                        <button className="quick-btn green" onClick={() => { setActiveTab('camera'); speakMessage(sceneSummary); }}><Icon.Eye /><span className="quick-btn-label">What I See</span><span className="quick-btn-sub">Live AI scan</span></button>
                        <button className="quick-btn red" onClick={triggerEmergency}><Icon.Phone /><span className="quick-btn-label">SOS</span><span className="quick-btn-sub">{contacts.length > 0 ? contacts[0].name : 'Add contact'}</span></button>
                        <button className="quick-btn purple" onClick={() => setActiveTab('safety')}><Icon.GamePad /><span className="quick-btn-label">Train Now</span><span className="quick-btn-sub">Practice mode</span></button>
                    </div>
                </div>

                {/* Result card */}
                <div className={`result-card tone-${resultCard.tone} mt-md`}>
                    <span className="result-kicker">{PERSONALITY_MODES[personality].label}</span>
                    <h4>{resultCard.title}</h4>
                    <p>{resultCard.body}</p>
                    {resultCard.actions?.length > 0 && (
                        <div className="result-actions">
                            {resultCard.actions.map(a => <button key={`${a.kind}-${a.label}`} className="result-action-btn" onClick={() => activateQuickAction(a)}>{a.label}</button>)}
                        </div>
                    )}
                </div>

                {voiceTranscript && <div className="transcript-bar mt-md"><div className="transcript-dot" /><span><strong>You said:</strong> {voiceTranscript}</span></div>}

                <div className="card mt-md">
                    <span className="card-kicker">Voice Commands</span>
                    <div className="commands-grid mt-sm">
                        {['"navigate to [place]"','"nearest restroom"','"nearest hospital"','"what is the weather"','"air quality"','"emergency"','"call my [contact]"','"what do you see"','"where am I"','"assistant [question]"'].map(c => <div key={c} className="cmd-chip">{c}</div>)}
                    </div>
                </div>

                <div className="card mt-md">
                    <span className="card-kicker">Getting Started</span>
                    <div className="onboarding-card mt-sm">
                        <h4>{ONBOARDING[onboardingIndex].title}</h4>
                        <p>{ONBOARDING[onboardingIndex].text}</p>
                        <div className="onboarding-nav mt-sm">
                            <button className="btn btn-ghost btn-sm" onClick={() => setOnboardingIndex(i => (i - 1 + ONBOARDING.length) % ONBOARDING.length)}>← Prev</button>
                            <span>{onboardingIndex + 1} / {ONBOARDING.length}</span>
                            <button className="btn btn-ghost btn-sm" onClick={() => setOnboardingIndex(i => (i + 1) % ONBOARDING.length)}>Next →</button>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    // ════════════════════════════════════════════════════════
    // TAB: CAMERA
    // ════════════════════════════════════════════════════════
    function renderCamera() {
        return (
            <>
                {indoorMode && <div className="indoor-banner"><Icon.Building /><span>Indoor mode — adjusted detection thresholds for enclosed spaces.</span></div>}
                <div className="camera-wrapper">
                    <CameraView onDetection={handleDetection} onAlert={handleAlert} requestedItem={requestedItem} hapticEnabled={hapticEnabled} indoorMode={indoorMode} />
                    {contextScenario && (
                        <div className="camera-overlay-info">
                            <span className="cam-badge scenario">{contextScenario.icon} {contextScenario.label}</span>
                            <span className="cam-badge fps">{detectedObjects.length} objects</span>
                        </div>
                    )}
                    {detectedObjects.length > 0 && (
                        <div className="camera-overlay-bottom">
                            <div className="detection-feed">
                                {detectedObjects.slice(0, 10).map(det => {
                                    const isCrit = ['car','truck','bus','motorcycle','train'].includes(det.class);
                                    const isHigh = ['person','traffic light','dog','bicycle','stop sign'].includes(det.class);
                                    const isTgt  = requestedItem && det.class.toLowerCase().includes(requestedItem.toLowerCase());
                                    return <span key={`${det.class}-${det.bbox?.[0]}`} className={`det-pill ${isTgt ? 'target' : isCrit ? 'critical' : isHigh ? 'high' : ''}`}>{det.class} {Math.round(det.score * 100)}%</span>;
                                })}
                            </div>
                        </div>
                    )}
                </div>
                <div className="card mt-md">
                    <span className="card-kicker">Find an Object</span>
                    <div className="row mt-sm" style={{ gap: '0.5rem' }}>
                        <input style={{ ...inputStyle, flex: 1 }} placeholder='e.g. "cup", "phone", "door"' value={requestedItem} onChange={e => setRequestedItem(e.target.value)} />
                        {requestedItem && <button className="btn btn-ghost btn-sm" onClick={() => setRequestedItem('')}>Clear</button>}
                    </div>
                </div>
            </>
        );
    }

    // ════════════════════════════════════════════════════════
    // TAB: NAVIGATE
    // ════════════════════════════════════════════════════════
    function renderNavigate() {
        return (
            <>
                <div className="card">
                    <div className="toggle-row">
                        <div className="toggle-info"><div className="toggle-label">Indoor Navigation</div><div className="toggle-desc">Optimised for malls, airports, offices</div></div>
                        <Toggle checked={indoorMode} onChange={e => { setIndoorMode(e.target.checked); speakMessage(e.target.checked ? 'Indoor navigation on.' : 'Outdoor navigation on.'); }} />
                    </div>
                </div>

                <div className="card mt-md">
                    <span className="card-kicker">Set Destination</span>
                    <div className="row mt-sm" style={{ gap: '0.5rem' }}>
                        <input style={{ ...inputStyle, flex: 1 }} placeholder="Enter any address or place name…" value={destination} onChange={e => { setDestination(e.target.value); setNavError(''); }} onKeyDown={e => e.key === 'Enter' && destination && navigateTo(destination)} />
                        <button className="btn btn-primary btn-sm" onClick={() => destination && navigateTo(destination)} disabled={!destination}>Go</button>
                    </div>
                    {navError && <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'rgba(255,59,85,0.1)', border: '1px solid rgba(255,59,85,0.2)', color: 'var(--red)', fontSize: '0.8rem' }}>{navError}</div>}
                    {isNavigating && navigationStatus && (
                        <div className="nav-status mt-md">
                            <div className="nav-step">Step {navigationStatus.currentStep} of {navigationStatus.totalSteps}</div>
                            <div className="nav-instruction">{navigationStatus.currentInstruction}</div>
                            <div className="nav-meta">{Math.round(navigationStatus.remainingDistance)}m · ~{Math.round(navigationStatus.remainingDuration / 60)} min</div>
                        </div>
                    )}
                    {mapsUrl && <a className="maps-link mt-sm" href={mapsUrl} target="_blank" rel="noreferrer"><Icon.Map /> Open in Google Maps</a>}
                    {isNavigating && <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.75rem' }} onClick={stopNavigation}>Stop Navigation</button>}
                </div>

                {/* Saved places — user editable */}
                <div className="card mt-md">
                    <div className="row between">
                        <span className="card-kicker">Saved Places</span>
                        <button className="btn btn-ghost btn-sm" onClick={addPlace} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Icon.Plus /> Add</button>
                    </div>

                    {editingPlace !== null && (
                        <div className="report-form mt-sm">
                            <input style={inputStyle} placeholder="Label (e.g. Home, Work)" value={editingPlace.label} onChange={e => setEditingPlace(p => ({ ...p, label: e.target.value }))} />
                            <input style={inputStyle} placeholder="Destination address or place name" value={editingPlace.destination} onChange={e => setEditingPlace(p => ({ ...p, destination: e.target.value }))} />
                            <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                                {ACCENT_OPTIONS.map(a => <button key={a} onClick={() => setEditingPlace(p => ({ ...p, accent: a }))} style={{ width: 28, height: 28, borderRadius: '50%', border: editingPlace.accent === a ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', background: { 'accent-sunrise': 'linear-gradient(135deg,#ffd060,#ff7a59)', 'accent-ocean': 'linear-gradient(135deg,#5b8fff,#00e0c0)', 'accent-mint': 'linear-gradient(135deg,#00cc88,#00e0c0)', 'accent-sunset': 'linear-gradient(135deg,#ff5ea8,#ff3b55)' }[a] }} />)}
                            </div>
                            <div className="row" style={{ gap: '0.5rem' }}>
                                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={saveEditedPlace}>Save</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditingPlace(null)}>Cancel</button>
                            </div>
                        </div>
                    )}

                    <div className="places-grid">
                        {savedPlaces.map((place, i) => (
                            <div key={place.key} style={{ position: 'relative' }}>
                                <button className={`place-tile ${place.accent}`} onClick={() => place.destination ? navigateTo(place.destination) : setEditingPlace({ index: i, label: place.label, destination: place.destination, accent: place.accent })} style={{ width: '100%' }}>
                                    <span className="place-tile-label">{place.label}</span>
                                    <span className="place-tile-dest">{place.destination || 'Tap to set'}</span>
                                </button>
                                <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: '0.25rem' }}>
                                    <button onClick={() => setEditingPlace({ index: i, label: place.label, destination: place.destination, accent: place.accent })} style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 12, height: 12, display: 'flex' }}><Icon.Edit /></span></button>
                                    {savedPlaces.length > 1 && <button onClick={() => deletePlace(i)} style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,59,85,0.5)', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 12, height: 12, display: 'flex' }}><Icon.Trash /></span></button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {learnedRoutes.length > 0 && (
                    <div className="card mt-md">
                        <span className="card-kicker">Your Frequent Routes</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.65rem' }}>
                            {learnedRoutes.slice(0, 5).map(r => (
                                <button key={r.destination} onClick={() => navigateTo(r.destination)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', background: 'var(--card)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
                                    <span style={{ color: 'var(--text)', fontSize: '0.88rem', fontWeight: 600 }}>{r.destination}</span>
                                    <span style={{ color: 'var(--text-faint)', fontSize: '0.72rem' }}>{r.count}× · {r.lastUsed}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {liveLocation && (
                    <div className="card mt-md">
                        <span className="card-kicker">Live Location</span>
                        <div className="location-grid">
                            <div className="location-pill"><span>Latitude</span><strong>{liveLocation.lat.toFixed(5)}</strong></div>
                            <div className="location-pill"><span>Longitude</span><strong>{liveLocation.lng.toFixed(5)}</strong></div>
                            <div className="location-pill"><span>Accuracy</span><strong>{Math.round(liveLocation.accuracy || 0)} m</strong></div>
                            <div className="location-pill"><span>Updated</span><strong>{locationUpdated || 'Now'}</strong></div>
                        </div>
                        {currentAddress && <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.65rem' }}>📍 {currentAddress}</p>}
                    </div>
                )}

                <div className="card mt-md">
                    <span className="card-kicker">Route Preferences</span>
                    <div className="pref-grid mt-sm">
                        {[['avoidBusyRoutes','Avoid busy routes'],['avoidMountainous','Avoid mountainous'],['avoidTolls','Avoid tolls']].map(([key, label]) => (
                            <button key={key} className={`pref-chip ${safetyOptions[key] ? 'on' : ''}`} onClick={() => toggleSafety(key)}>{safetyOptions[key] ? '✓ ' : ''}{label}</button>
                        ))}
                    </div>
                </div>
            </>
        );
    }

    // ════════════════════════════════════════════════════════
    // TAB: SAFETY
    // ════════════════════════════════════════════════════════
    function renderSafety() {
        return (
            <>
                {/* Emergency contacts — fully user-managed */}
                <div className="card" style={{ background: 'rgba(255,59,85,0.05)', borderColor: 'rgba(255,59,85,0.18)' }}>
                    <div className="row between">
                        <span className="card-kicker text-red">Emergency Contacts</span>
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowAddContact(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Icon.Plus /> Add</button>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: '0.3rem 0 0.75rem' }}>These are your real contacts. SOS will call the first one and share your GPS location by SMS.</p>

                    {showAddContact && (
                        <div className="report-form">
                            <input style={inputStyle} placeholder="Name (e.g. Mother, Sister)" value={newContact.name} onChange={e => setNewContact(c => ({ ...c, name: e.target.value }))} />
                            <input style={inputStyle} placeholder="Phone number (e.g. +27791234567)" value={newContact.phone} onChange={e => setNewContact(c => ({ ...c, phone: e.target.value }))} type="tel" />
                            <div className="row" style={{ gap: '0.5rem' }}>
                                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={addContact} disabled={!newContact.name || !newContact.phone}>Save Contact</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setShowAddContact(false)}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {editContact !== null && (
                        <div className="report-form mt-sm">
                            <input style={inputStyle} value={editContact.name} onChange={e => setEditContact(c => ({ ...c, name: e.target.value }))} placeholder="Name" />
                            <input style={inputStyle} value={editContact.phone} onChange={e => setEditContact(c => ({ ...c, phone: e.target.value }))} placeholder="Phone" type="tel" />
                            <div className="row" style={{ gap: '0.5rem' }}>
                                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={saveEditedContact}>Update</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditContact(null)}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {contacts.length === 0 ? (
                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.85rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                            No contacts yet. Tap + Add to add your first emergency contact.
                        </div>
                    ) : (
                        <div className="contact-list mt-sm">
                            {contacts.map((c, i) => (
                                <div key={i} className="contact-item">
                                    <div className="contact-info"><h5>{c.name}</h5><p>{c.phone}</p></div>
                                    <div className="row" style={{ gap: '0.35rem' }}>
                                        <button className="call-btn" onClick={() => { window.location.href = `tel:${c.phone}`; }}>Call</button>
                                        <button className="call-btn" style={{ borderColor: 'rgba(91,143,255,0.3)', background: 'rgba(91,143,255,0.1)', color: 'var(--blue)' }} onClick={() => shareLocationSMS(c)}>SMS</button>
                                        <button onClick={() => setEditContact({ index: i, name: c.name, phone: c.phone })} style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)', background: 'var(--card)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex' }}><span style={{ width: 14, height: 14 }}><Icon.Edit /></span></button>
                                        <button onClick={() => deleteContact(i)} style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)', background: 'rgba(255,59,85,0.1)', border: '1px solid rgba(255,59,85,0.2)', cursor: 'pointer', color: 'var(--red)', display: 'flex' }}><span style={{ width: 14, height: 14 }}><Icon.Trash /></span></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {contacts.length > 0 && (
                        <button className="btn btn-danger btn-full mt-md" onClick={triggerEmergency}>
                            <Icon.Phone /> SOS — Call {contacts[0].name} Now
                        </button>
                    )}
                </div>

                {/* Community reports */}
                <div className="card mt-md">
                    <div className="row between">
                        <span className="card-kicker">Community Hazard Reports</span>
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowReportForm(f => !f)}>{showReportForm ? 'Cancel' : '+ Report'}</button>
                    </div>
                    {showReportForm && (
                        <div className="report-form mt-sm">
                            <select style={inputStyle} value={newReport.type} onChange={e => setNewReport(r => ({ ...r, type: e.target.value }))}>
                                {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
                            </select>
                            <input style={inputStyle} placeholder="Describe the hazard and location" value={newReport.note} onChange={e => setNewReport(r => ({ ...r, note: e.target.value }))} />
                            {currentAddress && <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>📍 Will be tagged at: {currentAddress}</p>}
                            <button className="btn btn-primary btn-sm" onClick={submitReport} disabled={!newReport.note.trim()}>Submit Report</button>
                        </div>
                    )}
                    {communityReports.length === 0
                        ? <p style={{ fontSize: '0.82rem', color: 'var(--text-faint)', marginTop: '0.65rem' }}>No reports yet. Be the first to flag a local hazard.</p>
                        : <div className="report-list">
                            {communityReports.slice(0, 10).map(r => {
                                const t = REPORT_TYPES.find(x => x.value === r.type) || REPORT_TYPES[REPORT_TYPES.length - 1];
                                return (
                                    <div key={r.id} className="report-item">
                                        <div className={`report-icon ${t.cls}`}>{t.emoji}</div>
                                        <div className="report-body">
                                            <h5>{t.label}</h5>
                                            <p>{r.note}{r.address ? ` · ${r.address}` : ''} · {r.time}</p>
                                        </div>
                                    </div>
                                );
                            })}
                          </div>
                    }
                </div>

                {/* Training mode */}
                <div className="card mt-md">
                    <span className="card-kicker">Gamified Training Mode</span>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', margin: '0.35rem 0 0' }}>Practice navigating safely in simulated environments before heading outside.</p>
                    <div className="scenario-grid">
                        {TRAINING_SCENARIOS.map(s => (
                            <button key={s.id} className={`scenario-card ${trainingScenario?.id === s.id ? 'active' : ''}`} onClick={() => { startTraining(s); setActiveTab('home'); }}>
                                <span className="scenario-emoji">{s.emoji}</span>
                                <div className="scenario-name">{s.name}</div>
                                <div className="scenario-desc">{s.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </>
        );
    }

    // ════════════════════════════════════════════════════════
    // TAB: SETTINGS
    // ════════════════════════════════════════════════════════
    function renderSettings() {
        const voicesForLang = availableVoices.filter(v => v.lang.startsWith(selectedLanguage.split('-')[0]));
        return (
            <>
                <div className="card">
                    <span className="card-kicker">Voice Profile</span>
                    <div className="voice-profile-grid">
                        {Object.entries(PERSONALITY_MODES).map(([mode, cfg]) => (
                            <button key={mode} className={`profile-chip ${personality === mode ? 'active' : ''}`} onClick={() => changePersonality(mode)}>
                                <span className="profile-chip-label">{cfg.label}</span>
                                <span className="profile-chip-sub">{cfg.sub}</span>
                            </button>
                        ))}
                    </div>
                    <div className="slider-row mt-md">
                        <span className="slider-label">Speed</span>
                        <input type="range" min="0.5" max="2" step="0.05" value={voiceSpeed} onChange={e => changeSpeed(parseFloat(e.target.value))} />
                        <span className="slider-val">{voiceSpeed.toFixed(1)}×</span>
                    </div>
                    {voicesForLang.length > 0 && (
                        <div className="mt-sm">
                            <span className="card-kicker">Select System Voice</span>
                            <select style={{ ...inputStyle, marginTop: '0.5rem' }} value={selectedVoiceName} onChange={e => changeVoice(e.target.value)}>
                                <option value="">Default system voice</option>
                                {voicesForLang.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                            </select>
                        </div>
                    )}
                    <button className="btn btn-ghost btn-sm mt-sm" onClick={() => speakMessage('This is how I currently sound. Adjust the speed or pick a different voice above.')}>Test Voice</button>
                </div>

                <div className="card mt-md">
                    <span className="card-kicker">Language & Region</span>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.3rem', marginBottom: '0.5rem' }}>Changes both voice output and speech recognition language.</p>
                    <div className="lang-grid">
                        {LANGUAGES.map(lang => (
                            <button key={lang.code} className={`lang-btn ${selectedLanguage === lang.code ? 'active' : ''}`} onClick={() => changeLanguage(lang.code)}>
                                <span className="lang-flag">{lang.flag}</span>
                                <span className="lang-name">{lang.label}</span>
                                <span className="lang-code">{lang.code}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="card mt-md">
                    <span className="card-kicker">Accessibility & Wearable</span>
                    <div className="toggle-row mt-sm">
                        <div className="toggle-info"><div className="toggle-label">Haptic Feedback</div><div className="toggle-desc">Vibrate on hazard alerts (phone + smartwatch)</div></div>
                        <Toggle checked={hapticEnabled} onChange={e => toggleHaptic(e.target.checked)} />
                    </div>
                    <div className="toggle-row">
                        <div className="toggle-info"><div className="toggle-label">Indoor Mode</div><div className="toggle-desc">Relaxed thresholds for malls, airports, offices</div></div>
                        <Toggle checked={indoorMode} onChange={e => setIndoorMode(e.target.checked)} />
                    </div>
                </div>

                <div className="card mt-md">
                    <span className="card-kicker">Install on Your Phone</span>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: '0.35rem', lineHeight: 1.65 }}>VisionGuide is a Progressive Web App — no app store needed.</p>
                    {deferredPromptRef.current
                        ? <button className="btn btn-primary btn-full mt-md" onClick={handleInstall}><Icon.Download /> Install Now</button>
                        : (
                            <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                {[['1','Build: run npm run build in the project folder'],['2','Serve: npx serve -s build  or deploy to Vercel / Netlify'],['3','Open on your phone browser → Share → Add to Home Screen'],['4','VisionGuide icon appears on your home screen — works offline!']].map(([n, t]) => (
                                    <div key={n} className="row" style={{ gap: '0.65rem', alignItems: 'flex-start' }}>
                                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.72rem', fontWeight: 800, color: '#fff' }}>{n}</div>
                                        <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>{t}</span>
                                    </div>
                                ))}
                            </div>
                        )
                    }
                </div>

                <div className="card mt-md">
                    <span className="card-kicker">Live Status</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.65rem' }}>
                        {[
                            [isOffline ? <Icon.WifiOff /> : <Icon.Wifi />, isOffline ? 'Offline mode' : 'Online — live APIs active', isOffline ? 'var(--red)' : 'var(--green)'],
                            [<Icon.Mic />, isListening ? 'Voice recognition active' : 'Voice standby', isListening ? 'var(--teal)' : 'var(--text-faint)'],
                            [<Icon.Location />, currentAddress || (liveLocation ? 'GPS locked' : locationError || 'Waiting for GPS…'), liveLocation ? 'var(--blue)' : 'var(--text-faint)'],
                            [<Icon.Eye />, `${detectedObjects.length} objects in camera view`, 'var(--blue)'],
                            [<Icon.Alert />, `${hazardCount} hazard signal${hazardCount !== 1 ? 's' : ''}`, hazardCount > 0 ? 'var(--amber)' : 'var(--text-faint)'],
                            [<span>🌡️</span>, weather ? `${weather.temperature}°C — ${weather.condition}` : 'Weather not loaded', weather ? 'var(--text)' : 'var(--text-faint)'],
                            [<span>🏭</span>, airQuality ? `AQI ${airQuality.aqi} — ${airQuality.level}` : 'Air quality not loaded', airQuality ? (airQuality.aqi > 60 ? 'var(--amber)' : 'var(--green)') : 'var(--text-faint)'],
                        ].map(([icon, label, color], i) => (
                            <div key={i} className="row" style={{ gap: '0.65rem', color }}>
                                <span style={{ width: 18, height: 18, display: 'flex', flexShrink: 0 }}>{icon}</span>
                                <span style={{ fontSize: '0.83rem', fontWeight: 600 }}>{label}</span>
                            </div>
                        ))}
                    </div>
                    {liveLocation && <button className="btn btn-ghost btn-sm mt-md btn-full" onClick={fetchEnvironmentData}>{weatherLoading ? 'Loading…' : '↻ Refresh Weather & Air Quality'}</button>}
                </div>
            </>
        );
    }

    // ════════════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════════════
    return (
        <div className="app-shell">
            {/* Emergency overlay */}
            {emergencyActive && (
                <div className="emergency-overlay">
                    <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🆘</div>
                    <h2>EMERGENCY ACTIVE</h2>
                    <p>Calling your emergency contacts now. Stay calm and stay still.</p>
                    <div className="emergency-contacts-grid">
                        {contacts.slice(0, 4).map((c, i) => (
                            <button key={i} className="em-contact-btn" onClick={() => { window.location.href = `tel:${c.phone}`; }}>Call {c.name}</button>
                        ))}
                    </div>
                    <div className="row" style={{ gap: '0.65rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {contacts[0] && <button className="em-dismiss-btn" onClick={() => shareLocationSMS(contacts[0])}><Icon.Share /> Share Location</button>}
                        <button className="em-dismiss-btn" onClick={() => { setEmergencyActive(false); }}>Dismiss</button>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="app-header">
                <div className="header-brand">
                    <div className="header-icon"><Icon.Eye /></div>
                    <div>
                        <div className="header-title">VisionGuide</div>
                        <div className="header-subtitle">{currentAddress ? currentAddress.split(',')[0] : 'Voice + AI + Safety'}</div>
                    </div>
                </div>
                <div className="header-badges">
                    <span className={`badge ${isOffline ? 'offline' : 'online'}`}>{isOffline ? 'Offline' : 'Online'}</span>
                    {weather && <span className="badge" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text)' }}>{weatherIcon(weather.weathercode)} {weather.temperature}°C</span>}
                    {isListening && <span className="badge active">Listening</span>}
                </div>
            </header>

            {/* Content */}
            <main className="app-main">
                {activeTab === 'home'     && renderHome()}
                {activeTab === 'camera'   && renderCamera()}
                {activeTab === 'navigate' && renderNavigate()}
                {activeTab === 'safety'   && renderSafety()}
                {activeTab === 'settings' && renderSettings()}
            </main>

            {/* Bottom nav */}
            <nav className="bottom-nav" aria-label="Main navigation">
                {[
                    { id: 'home',     NavIcon: Icon.Home,     label: 'Home'     },
                    { id: 'camera',   NavIcon: Icon.Camera,   label: 'Camera'   },
                    { id: 'navigate', NavIcon: Icon.Navigate, label: 'Navigate' },
                    { id: 'safety',   NavIcon: Icon.Shield,   label: 'Safety'   },
                    { id: 'settings', NavIcon: Icon.Settings, label: 'Settings' },
                ].map(({ id, NavIcon, label }) => (
                    <button key={id} className={`nav-btn ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)} aria-label={label} aria-current={activeTab === id ? 'page' : undefined}>
                        <NavIcon />
                        <span>{label}</span>
                    </button>
                ))}
            </nav>
        </div>
    );
}

export default App;
