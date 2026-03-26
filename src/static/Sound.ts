// Web Audio API sound synthesis for Pac-Man game events.
// AudioContext is created on first call to init() which must be triggered
// by a user gesture (key press or touch) to satisfy browser autoplay policy.

export class Sound {
    static audioCtx: AudioContext | null = null;
    static dotToggle = false;

    // Call from the first user interaction handler
    static init(): void {
        if (Sound.audioCtx) return;
        try {
            Sound.audioCtx = new AudioContext();
        } catch {
            // Audio not available — all sound calls become no-ops
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static tone(
        freq: number,
        duration: number,
        when = 0,
        type: OscillatorType = 'square',
        vol = 0.12,
    ): void {
        const ctx = Sound.audioCtx;
        if (!ctx) return;
        const startTime = ctx.currentTime + when;
        try {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(vol, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration + 0.01);
        } catch {
            // Ignore errors (e.g. context suspended)
        }
    }

    // ── Sound events ──────────────────────────────────────────────────────────

    // Alternating two-tone "waka-waka" on every dot eaten
    static dot(): void {
        Sound.dotToggle = !Sound.dotToggle;
        Sound.tone(Sound.dotToggle ? 220 : 180, 0.07);
    }

    // Short chord on energizer pickup
    static energizer(): void {
        Sound.tone(440, 0.25, 0,    'sine', 0.18);
        Sound.tone(554, 0.20, 0.05, 'sine', 0.12);
    }

    // Ascending arpeggio when a ghost is eaten
    static ghostEaten(): void {
        [392, 494, 587, 784].forEach((freq, i) => {
            Sound.tone(freq, 0.08, i * 0.07, 'square', 0.14);
        });
    }

    // Descending "death" melody when Pac-Man dies
    static death(): void {
        [480, 420, 360, 300, 240, 180].forEach((freq, i) => {
            Sound.tone(freq, 0.13, i * 0.10, 'square', 0.15);
        });
    }

    // Short victory jingle on level clear
    static levelClear(): void {
        [523, 659, 784, 1047].forEach((freq, i) => {
            Sound.tone(freq, 0.10, i * 0.09, 'sine', 0.14);
        });
    }
}
