# VisionGuide — AI-Powered Navigation for the Visually Impaired

> Real-time obstacle detection, voice-guided navigation, and AI scene understanding — built as a Progressive Web App installable on any phone.

**Live App:** [MpiloG29.github.io/VisionGuide](https://MpiloG29.github.io/VisionGuide)

---

## Overview

VisionGuide is a mobile-first web application that empowers visually impaired individuals to navigate their environment independently. It uses your phone's camera, microphone, GPS, and speaker to detect obstacles, guide you to destinations, describe your surroundings, and call for help — all hands-free by voice.

---

## Features

### Core Navigation
- **Voice-Guided Walking Directions** — Say "navigate to [place]" for real turn-by-turn instructions powered by OSRM routing
- **Live GPS Tracking** — Real-time position with reverse geocoding (shows your current street/suburb via OpenStreetMap)
- **Nearby Places** — Find the nearest hospital, pharmacy, police station, mall, restroom, restaurant, ATM, or bus stop by voice

### AI Camera
- **Real-Time Object Detection** — Detects 90+ objects (people, vehicles, stairs, furniture) using TensorFlow.js + COCO-SSD running entirely on-device
- **Context-Aware Scenario Detection** — Automatically identifies situations: crosswalk, crowded area, staircase, kitchen, office, and more
- **AI Scene Summarization** — Rich descriptions like "You are near a dining table. A person is 2 steps ahead on the left"
- **Traffic Light Color Estimation** — Analyses the camera feed to estimate red/green/yellow signal
- **Indoor Mode** — Lowers detection thresholds for dimmer indoor environments

### Safety
- **Emergency SOS** — One tap sends your live GPS location via SMS to your emergency contacts
- **Emergency Contacts** — Add, edit, and delete your own contacts (stored on your device — no hardcoded numbers)
- **Community Hazard Reports** — Report and view real-world hazards tagged with GPS coordinates and your real address
- **Haptic Feedback** — Vibration patterns for alerts (works on supported devices)

### Environment
- **Live Weather** — Real temperature, wind speed, and condition via Open-Meteo (no API key needed)
- **Air Quality Index** — Live AQI, PM2.5, PM10 levels with safety alerts
- **Weather Alerts** — Automatic spoken warnings for fog, heavy rain, thunderstorms, and extreme heat

### Voice Control
- **Fully Hands-Free** — Every feature is accessible by voice command
- **8 Languages** — English (ZA/US/UK), Zulu, Sesotho, Afrikaans, French, Portuguese, Swahili
- **Voice Profiles** — Calm, Energetic, or Minimal speech style with adjustable speed
- **Continuous Listening** — Microphone stays active in the background

### Accessibility & UX
- **Multilingual Support** — Switch language at runtime; voice recognition engine updates instantly
- **Gamified Training Mode** — 6 indoor practice scenarios to learn the app by touch and sound
- **Learning & Adaptation** — Remembers your frequent routes from localStorage
- **Saved Places** — Set Home, Work, School, Gym, Hospital, and a custom place with one tap navigation
- **PWA Install** — Installable on Android and iPhone like a native app, works offline for the UI shell

---

## Voice Commands

| Say | Action |
|-----|--------|
| `navigate to [place]` | Start walking directions |
| `where am I` | Hear your current address |
| `what do you see` | AI describes your surroundings |
| `nearest hospital` | Find closest hospital |
| `nearest pharmacy` | Find closest pharmacy |
| `nearest restroom` | Find closest toilet |
| `nearest police` | Find closest police station |
| `nearest mall` | Find closest shopping mall |
| `nearest restaurant` | Find closest food |
| `nearest ATM` | Find closest bank or ATM |
| `nearest bus stop` | Find closest transport |
| `what is the weather` | Live weather report |
| `air quality` | Current AQI and pollution level |
| `emergency` / `SOS` | Trigger emergency alert |
| `call my [name]` | Call an emergency contact |
| `assistant [question]` | Ask the AI assistant anything |
| `stop navigation` | Cancel current route |
| `status` | Remaining distance and ETA |
| `repeat` | Hear last instruction again |
| `help` | List all commands |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 |
| AI / Object Detection | TensorFlow.js + COCO-SSD (on-device) |
| Voice Input | Web Speech API (SpeechRecognition) |
| Voice Output | Web Speech API (SpeechSynthesis) |
| Routing | OSRM (Open Source Routing Machine) |
| Geocoding | Nominatim / OpenStreetMap |
| Weather & AQI | Open-Meteo (free, no API key) |
| Nearby Places | Overpass API (OpenStreetMap) |
| Maps | Leaflet + React-Leaflet |
| PWA | Service Worker + Web App Manifest |
| Persistence | localStorage (contacts, places, routes) |
| Hosting | GitHub Pages |

---

## Getting Started

### Install on your phone (no app store needed)

1. Open [MpiloG29.github.io/VisionGuide](https://MpiloG29.github.io/VisionGuide) in your browser
2. **Android (Chrome):** Tap the 3-dot menu → Add to Home Screen
3. **iPhone (Safari):** Tap the Share button → Add to Home Screen

### Run locally

```bash
git clone https://github.com/MpiloG29/VisionGuide.git
cd VisionGuide
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for production

```bash
npm run build
```

### Deploy to GitHub Pages

```bash
npm run deploy
```

---

## Permissions Required

| Permission | Why |
|-----------|-----|
| Camera | Real-time object detection and scene analysis |
| Microphone | Voice command recognition |
| Location (GPS) | Navigation, nearby places, emergency SOS |
| Notifications | Safety alerts and navigation updates |

---

## Privacy

- All object detection runs **on-device** — your camera feed never leaves your phone
- Emergency contacts and saved places are stored **locally** in your browser (localStorage)
- Location is only sent to OpenStreetMap/OSRM for routing and reverse geocoding
- No user accounts, no tracking, no data collection

---

## Project Structure

```
src/
├── App.jsx                          # Main app — all tabs, state, voice commands
├── components/
│   └── CameraView.jsx               # TensorFlow object detection + scene analysis
├── services/
│   ├── NavigationService.js         # GPS, routing, weather, AQI, geocoding, nearby places
│   └── VoiceInputService.js         # Speech recognition + command parsing
└── styles/
    └── App.css                      # Dark mobile-first design system
public/
├── manifest.json                    # PWA manifest with shortcuts
├── sw.js                            # Service worker (offline support)
└── icons/                           # SVG app icons
```

---

## License

MIT — free to use, modify, and distribute.
