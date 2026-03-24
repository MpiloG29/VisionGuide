/**
 * Simplified Voice Input Service for demo purposes
 */

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
            see: ['what do you see', 'what is around me', 'describe my surroundings', 'tell me what you see'],
            stop: ['stop', 'cancel', 'end navigation', 'stop navigation'],
            where: ['where am i', 'my location', 'current location'],
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

        this.recognition.onstart = () => {
            this.isListening = true;
            console.log('Voice input started');
        };

        this.recognition.onend = () => {
            this.isListening = false;
            if (this.shouldContinue) {
                setTimeout(() => this.startListening(), 100);
            }
        };

        this.recognition.onresult = (event) => {
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript) {
                this.processCommand(finalTranscript);
                if (this.onTranscriptCallback) {
                    this.onTranscriptCallback(finalTranscript);
                }
            }
        };

        return true;
    }

    startListening() {
        if (!this.recognition) {
            if (!this.init()) return false;
        }

        try {
            this.shouldContinue = true;
            this.recognition.start();
            return true;
        } catch (error) {
            console.error('Failed to start listening:', error);
            return false;
        }
    }

    stopListening() {
        this.shouldContinue = false;
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
    }

    processCommand(transcript) {
        const lowerTranscript = transcript.toLowerCase().trim();
        console.log('Command received:', lowerTranscript);

        let commandType = null;
        let params = null;

        for (const [cmd, phrases] of Object.entries(this.commands)) {
            for (const phrase of phrases) {
                if (lowerTranscript.includes(phrase)) {
                    commandType = cmd;

                    if (cmd === 'navigate') {
                        const destinationMatch = lowerTranscript.split(phrase).pop().trim();
                        if (destinationMatch) {
                            params = { destination: destinationMatch };
                        }
                    }

                    if (cmd === 'find') {
                        const itemMatch = lowerTranscript.split(phrase).pop().trim();
                        if (itemMatch) {
                            params = { item: itemMatch.replace(/^my\s+/, '') };
                        }
                    }

                    break;
                }
            }

            if (commandType) break;
        }

        if (commandType && this.onCommandCallback) {
            this.onCommandCallback(commandType, params);
        }

        return commandType;
    }

    onCommand(callback) {
        this.onCommandCallback = callback;
    }

    onTranscript(callback) {
        this.onTranscriptCallback = callback;
    }

    getCommandsList() {
        return {
            navigate: 'Say "navigate to [destination]" or "I am going to [destination]" to set destination',
            find: 'Say "find [item]" or "where is [item]" to search for an object',
            see: 'Say "what do you see" to hear a live scene summary',
            stop: 'Say "stop navigation" to end guidance',
            where: 'Say "where am I" to hear your current location',
            status: 'Say "status" to hear remaining distance and time',
            repeat: 'Say "repeat" to hear the last instruction again',
            help: 'Say "help" to hear available commands'
        };
    }
}

export default VoiceInputService;