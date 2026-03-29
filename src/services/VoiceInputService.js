class VoiceInputService {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.onCommandCallback = null;
        this.onTranscriptCallback = null;
        this.shouldContinue = false;
        this.commands = {
            navigate: ['navigate to', 'go to', 'take me to', 'set destination', 'i am going to', 'heading to'],
            find: ['find', 'help me find', 'look for', 'where is', 'locate'],
            nearbyRestroom: ['nearest restroom', 'nearby restroom', 'find restroom', 'toilet near me', 'nearest bathroom'],
            nearbyMall: ['nearest mall', 'nearby mall', 'shopping mall near me'],
            nearbyHelp: ['nearest hospital', 'nearest police', 'closest help', 'safe place near me'],
            emergency: ['emergency', 'help me now', 'danger', 'panic mode'],
            call: ['call my', 'call'],
            assistant: ['assistant', 'ask assistant', 'help me with'],
            see: ['what do you see', 'what is around me', 'describe my surroundings', 'tell me what you see', 'what is the traffic robot color'],
            stop: ['stop', 'cancel', 'end navigation', 'stop navigation'],
            where: ['where am i', 'my location', 'current location', 'live location', 'show live location', 'show my location'],
            status: ['status', 'how far', 'remaining distance', 'eta'],
            repeat: ['repeat', 'say again', 'repeat instruction'],
            help: ['help', 'commands', 'what can i say']
        };
    }

    init() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.warn('Speech recognition not supported');
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'en-US';
        this.recognition.continuous = true;
        this.recognition.interimResults = true;

        this.recognition.onstart = () => { this.isListening = true; };
        this.recognition.onend = () => {
            this.isListening = false;
            if (this.shouldContinue) setTimeout(() => this.startListening(), 120);
        };

        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
            }
            if (finalTranscript) {
                this.processCommand(finalTranscript);
                if (this.onTranscriptCallback) this.onTranscriptCallback(finalTranscript);
            }
        };

        return true;
    }

    startListening() {
        if (!this.recognition && !this.init()) return false;
        try {
            this.shouldContinue = true;
            this.recognition.start();
            return true;
        } catch {
            return false;
        }
    }

    stopListening() {
        this.shouldContinue = false;
        if (this.recognition && this.isListening) this.recognition.stop();
    }

    processCommand(transcript) {
        const lowerTranscript = transcript.toLowerCase().trim();
        let commandType = null;
        let params = null;

        for (const [cmd, phrases] of Object.entries(this.commands)) {
            const phrase = phrases.find((entry) => lowerTranscript.includes(entry));
            if (!phrase) continue;

            commandType = cmd;
            if (cmd === 'navigate') {
                const destinationMatch = lowerTranscript.split(phrase).pop().trim();
                if (destinationMatch) params = { destination: destinationMatch };
            }
            if (cmd === 'find') {
                const itemMatch = lowerTranscript.split(phrase).pop().trim();
                if (itemMatch) params = { item: itemMatch.replace(/^my\s+/, '') };
            }
            if (cmd === 'call') {
                const contactMatch = lowerTranscript.split(phrase).pop().trim();
                if (contactMatch) params = { contact: contactMatch.replace(/^my\s+/, '') };
            }
            if (cmd === 'assistant') {
                const question = lowerTranscript.split(phrase).pop().trim();
                params = { question: question || lowerTranscript };
            }
            break;
        }

        if (commandType && this.onCommandCallback) this.onCommandCallback(commandType, params);
        return commandType;
    }

    onCommand(callback) { this.onCommandCallback = callback; }
    onTranscript(callback) { this.onTranscriptCallback = callback; }

    getCommandsList() {
        return {
            navigate: 'Say "navigate to [destination]" to start live walking guidance.',
            find: 'Say "find [item]" to track objects like phone, laptop, or keys in camera view.',
            nearbyRestroom: 'Say "nearest restroom" to open nearby restrooms.',
            nearbyMall: 'Say "nearest mall" to open nearby malls.',
            nearbyHelp: 'Say "nearest hospital" or "closest help" for emergency places.',
            emergency: 'Say "emergency" or tap emergency button to alert and call contact.',
            call: 'Say "call my mother" or "call father".',
            assistant: 'Say "assistant [question]" to ask for guidance by voice.',
            trafficRobot: 'Ask "what is the traffic robot color" to hear red/green updates when visible.',
            see: 'Say "what do you see" to hear a live scene summary.',
            stop: 'Say "stop navigation" to end guidance.',
            where: 'Say "where am I" to hear your current location.',
            status: 'Say "status" to hear remaining distance and time.',
            repeat: 'Say "repeat" to hear the last instruction again.',
            help: 'Say "help" to hear available commands.'
        };
    }
}

export default VoiceInputService;
