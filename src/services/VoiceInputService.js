/**
 * VisionGuide VoiceInputService
 * Uses the real browser Web Speech API for recognition and synthesis.
 * Language is fully configurable at runtime — no hardcoded locale.
 */
class VoiceInputService {
    constructor() {
        this.recognition          = null;
        this.isListening          = false;
        this.onCommandCallback    = null;
        this.onTranscriptCallback = null;
        this.shouldContinue       = false;
        this.lang                 = 'en-ZA';    // default; overridden by setLanguage()

        // Command trigger phrases — keyed by command type.
        // Keep the most specific phrases first so shorter phrases don't shadow them.
        this.commands = {
            navigate:       ['navigate to', 'go to', 'take me to', 'set destination to', 'directions to', 'i am going to', 'heading to', 'route to'],
            find:           ['help me find', 'look for', 'locate my', 'locate', 'find my', 'where is my', 'where is', 'find'],
            nearbyRestroom: ['nearest restroom', 'nearby restroom', 'find restroom', 'toilet near me', 'nearest bathroom', 'nearest toilet'],
            nearbyMall:     ['nearest mall', 'nearby mall', 'shopping mall near me', 'find mall'],
            nearbyHospital: ['nearest hospital', 'nearest clinic', 'find hospital'],
            nearbyPharmacy: ['nearest pharmacy', 'find pharmacy', 'nearest chemist'],
            nearbyPolice:   ['nearest police', 'police station near me'],
            nearbyFood:     ['nearest restaurant', 'find food', 'nearest cafe', 'nearest fast food'],
            nearbyBank:     ['nearest atm', 'nearest bank', 'find atm'],
            nearbyTransport:['nearest bus stop', 'nearest station', 'find taxi', 'nearest bus'],
            nearbyHelp:     ['closest help', 'safe place near me', 'nearest help'],
            emergency:      ['emergency', 'help me now', 'danger', 'panic', 'sos'],
            call:           ['call my', 'call'],
            assistant:      ['assistant', 'ask assistant', 'hey assistant'],
            weather:        ['what is the weather', 'weather today', 'is it raining', 'will it rain', 'current weather'],
            airquality:     ['air quality', 'air pollution', 'is the air safe'],
            see:            ['what do you see', 'what is around me', 'describe my surroundings', 'tell me what you see', 'scan surroundings', 'what is the traffic robot color', 'traffic light color'],
            stop:           ['stop navigation', 'cancel navigation', 'end navigation', 'stop', 'cancel'],
            where:          ['where am i', 'my location', 'current location', 'live location', 'what street am i on', 'what area am i in'],
            status:         ['navigation status', 'how far', 'remaining distance', 'eta', 'status'],
            repeat:         ['repeat that', 'say again', 'repeat instruction', 'repeat'],
            help:           ['list commands', 'what can i say', 'help me', 'help'],
        };
    }

    // ── Initialise Web Speech API ──────────────────────────
    init(lang) {
        if (lang) this.lang = lang;

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            console.warn('VisionGuide: Speech recognition not available in this browser.');
            return false;
        }

        this.recognition                = new SR();
        this.recognition.lang           = this.lang;
        this.recognition.continuous     = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 2;

        this.recognition.onstart = () => { this.isListening = true; };

        this.recognition.onend = () => {
            this.isListening = false;
            if (this.shouldContinue) setTimeout(() => this._safeStart(), 200);
        };

        this.recognition.onerror = (e) => {
            // 'aborted' and 'no-speech' are harmless — restart silently
            if (e.error === 'aborted' || e.error === 'no-speech') return;
            console.warn('VisionGuide speech error:', e.error);
        };

        this.recognition.onresult = (event) => {
            let finalText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) finalText += event.results[i][0].transcript + ' ';
            }
            finalText = finalText.trim();
            if (!finalText) return;

            if (this.onTranscriptCallback) this.onTranscriptCallback(finalText);
            this._processCommand(finalText);
        };

        return true;
    }

    // ── Language switch at runtime ──────────────────────────
    setLanguage(langCode) {
        this.lang = langCode;
        if (this.recognition) {
            const wasListening = this.isListening;
            if (wasListening) this.stopListening();
            this.recognition.lang = langCode;
            if (wasListening) this.startListening();
        }
    }

    // ── Start / stop ────────────────────────────────────────
    startListening() {
        if (!this.recognition && !this.init()) return false;
        this.shouldContinue = true;
        return this._safeStart();
    }

    stopListening() {
        this.shouldContinue = false;
        if (this.recognition && this.isListening) {
            try { this.recognition.stop(); } catch { /* already stopped */ }
        }
    }

    _safeStart() {
        try { this.recognition.start(); return true; } catch { return false; }
    }

    // ── Command parsing ─────────────────────────────────────
    _processCommand(transcript) {
        const lower = transcript.toLowerCase().trim();
        let commandType = null;
        let params      = {};

        for (const [cmd, phrases] of Object.entries(this.commands)) {
            const matched = phrases.find(p => lower.includes(p));
            if (!matched) continue;

            commandType = cmd;
            const after = lower.slice(lower.indexOf(matched) + matched.length).trim();

            if (cmd === 'navigate' && after) params.destination = this._cleanParam(after);
            if (cmd === 'find'     && after) params.item        = this._cleanParam(after.replace(/^my\s+/, ''));
            if (cmd === 'call'     && after) params.contact     = this._cleanParam(after.replace(/^my\s+/, ''));
            if (cmd === 'assistant' && after) params.question   = after;
            break;
        }

        if (commandType && this.onCommandCallback) {
            this.onCommandCallback(commandType, params);
        }
        return commandType;
    }

    _cleanParam(text) {
        // Strip trailing filler words that may appear at end of voice transcripts
        return text.replace(/\b(please|now|quickly|okay|ok)\s*$/i, '').trim();
    }

    // ── Callbacks ───────────────────────────────────────────
    onCommand(cb)    { this.onCommandCallback    = cb; }
    onTranscript(cb) { this.onTranscriptCallback = cb; }

    getCommandsList() {
        return {
            navigate:    '"navigate to [place]" — start walking directions',
            find:        '"find [object]" — track item in camera',
            nearby:      '"nearest restroom / hospital / mall / pharmacy / police / bus stop"',
            weather:     '"what is the weather" — live weather & alerts',
            airquality:  '"air quality" — current air pollution level',
            see:         '"what do you see" — AI scene description',
            location:    '"where am I" — your current address',
            emergency:   '"emergency" or "SOS" — alert contacts',
            call:        '"call my [name]" — phone emergency contact',
            assistant:   '"assistant [question]" — ask anything',
            stop:        '"stop navigation"',
            status:      '"status" — remaining distance & time',
            repeat:      '"repeat" — hear last instruction again',
            help:        '"help" — list all commands',
        };
    }
}

export default VoiceInputService;
