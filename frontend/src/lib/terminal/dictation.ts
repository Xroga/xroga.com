/**
 * Browser dictation for the workspace composer.
 *
 * Uses only the browser's own Web Speech API (SpeechRecognition /
 * webkitSpeechRecognition). Nothing here records audio, calls a Xroga route or
 * stores a transcript: the text only ever reaches the composer the user is
 * already typing in. Whether the browser sends audio to its own vendor's
 * recognition service is the browser's behaviour, not ours.
 */

export interface DictationAlternative {
  transcript: string;
}

export interface DictationResult {
  isFinal: boolean;
  0?: DictationAlternative;
}

export interface DictationEvent {
  resultIndex: number;
  results: ArrayLike<DictationResult>;
}

export interface DictationRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: DictationEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export type DictationConstructor = new () => DictationRecognition;

export type DictationState = 'idle' | 'requesting' | 'listening' | 'stopping';

export type DictationErrorCode =
  | 'permission-denied'
  | 'no-microphone'
  | 'network'
  | 'unsupported-language'
  | 'no-speech'
  | 'unsupported'
  | 'failed';

export const DICTATION_ERROR_MESSAGES: Record<DictationErrorCode, string> = {
  'permission-denied': 'Microphone permission is blocked. Allow it in your browser settings, or type instead.',
  'no-microphone': 'No microphone was found. Connect one, or type instead.',
  network: 'Speech recognition could not reach your browser’s speech service. Check your connection and try again.',
  'unsupported-language': 'Your browser cannot recognise this language. Type instead.',
  'no-speech': 'No speech was heard. Click the microphone and try again.',
  unsupported: 'Voice typing is not supported in this browser. Try Chrome, Edge or Safari, or type instead.',
  failed: 'Voice input stopped unexpectedly. Try again, or type instead.',
};


export function getDictationConstructor(
  win: { SpeechRecognition?: DictationConstructor; webkitSpeechRecognition?: DictationConstructor } | undefined,
): DictationConstructor | null {
  if (!win) return null;
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

const REGION_DEFAULTS: Record<string, string> = { en: 'en-US', hi: 'hi-IN' };

/**
 * One language per recognition session is all the engine accepts. Default to
 * the user's own browser language so a Hindi/English speaker in India (en-IN
 * or hi-IN) gets the engine tuned for them; a bare tag gets a regional default.
 */
export function dictationLanguage(languages: readonly string[] | undefined, language: string | undefined): string {
  const tag = (languages?.find((entry) => entry && entry.trim()) ?? language ?? '').trim();
  if (!tag) return 'en-US';
  if (tag.includes('-')) return tag;
  return REGION_DEFAULTS[tag.toLowerCase()] ?? tag;
}

const CJK = /[぀-ヿ㐀-鿿가-힯]/u;

/** Joins two spoken segments, trimming engine padding and avoiding spaces the language does not use. */
export function joinSpoken(left: string, right: string): string {
  const a = left.trim();
  const b = right.trim();
  if (!a) return b;
  if (!b) return a;
  if (/^[.,!?;:)\]]/.test(b)) return `${a}${b}`;
  if (CJK.test(a.slice(-1)) || CJK.test(b.charAt(0))) return `${a}${b}`;
  return `${a} ${b}`;
}

export interface DraftBase {
  prefix: string;
  suffix: string;
}

/** Splits the draft at the caret/selection so speech lands there, never over existing text. */
export function draftBaseFrom(text: string, selectionStart: number | null | undefined, selectionEnd?: number | null): DraftBase {
  const length = text.length;
  const start = Math.min(Math.max(selectionStart ?? length, 0), length);
  const end = Math.min(Math.max(selectionEnd ?? start, start), length);
  return { prefix: text.slice(0, start), suffix: text.slice(end) };
}

/** Places spoken text between the user's prefix and suffix with sensible spacing. */
export function composeDraft(base: DraftBase, spoken: string): { text: string; caret: number } {
  const speech = spoken.trim();
  if (!speech) return { text: base.prefix + base.suffix, caret: base.prefix.length };
  const lead = base.prefix && !/\s$/.test(base.prefix) ? ' ' : '';
  const tail = base.suffix && !/^[\s.,!?;:)\]]/.test(base.suffix) ? ' ' : '';
  const head = `${base.prefix}${lead}${speech}`;
  return { text: `${head}${tail}${base.suffix}`, caret: head.length };
}

export interface DictationSnapshot {
  /** Everything the engine has finalised this session, in order. */
  final: string;
  /** The still-changing tail the engine has not committed yet. */
  interim: string;
}

export interface DictationControllerOptions {
  Recognition: DictationConstructor;
  lang: string;
  onState: (state: DictationState) => void;
  onSpoken: (snapshot: DictationSnapshot, done: boolean) => void;
  onError: (code: DictationErrorCode) => void;
  /** Delay before reopening recognition after the browser ends it on silence. */
  restartDelayMs?: number;
  /** Safety net if the engine never reports `end` after stop(). */
  stopTimeoutMs?: number;
  /** Consecutive restarts with no speech before giving up. */
  maxIdleRestarts?: number;
}

const FATAL: Record<string, DictationErrorCode> = {
  'not-allowed': 'permission-denied',
  'service-not-allowed': 'permission-denied',
  'audio-capture': 'no-microphone',
  network: 'network',
  'language-not-supported': 'unsupported-language',
  'bad-grammar': 'failed',
};

/**
 * Owns one dictation session: continuous recognition that is reopened when the
 * browser ends it on silence, until the user stops it.
 */
export class DictationController {
  private readonly options: DictationControllerOptions;
  private state: DictationState = 'idle';
  private recognition: DictationRecognition | null = null;
  private committed = '';
  private currentFinal = '';
  private currentInterim = '';
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private idleRestarts = 0;
  private heardThisInstance = false;
  private fatal: DictationErrorCode | null = null;

  constructor(options: DictationControllerOptions) {
    this.options = options;
  }

  getState(): DictationState {
    return this.state;
  }

  /** Must be called from the user's click so the browser permission prompt is allowed. */
  start(): void {
    if (this.state !== 'idle') return;
    this.committed = '';
    this.fatal = null;
    this.idleRestarts = 0;
    this.setState('requesting');
    this.open();
  }

  /** Ends listening; the transcript so far is delivered once the engine settles. */
  stop(): void {
    if (this.state === 'idle' || this.state === 'stopping') return;
    this.setState('stopping');
    this.clearRestart();
    const recognition = this.recognition;
    if (!recognition) {
      this.finish();
      return;
    }
    try {
      recognition.stop();
    } catch {
      this.finish();
      return;
    }
    this.stopTimer = setTimeout(() => this.finish(), this.options.stopTimeoutMs ?? 1500);
  }

  /** Drops everything without delivering text (navigation away, unmount). */
  abort(): void {
    this.clearRestart();
    this.clearStop();
    const recognition = this.recognition;
    this.detach();
    try {
      recognition?.abort();
    } catch {
      // The engine may already have ended.
    }
    this.committed = '';
    this.currentFinal = '';
    this.currentInterim = '';
    this.setState('idle');
  }

  /** The composer text changed under us: forget what was said so far and listen afresh. */
  resetSpeech(): void {
    if (this.state === 'idle' || this.state === 'stopping') return;
    this.committed = '';
    this.currentFinal = '';
    this.currentInterim = '';
    this.clearRestart();
    const recognition = this.recognition;
    this.detach();
    try {
      recognition?.abort();
    } catch {
      // The engine may already have ended.
    }
    this.open();
  }

  private setState(state: DictationState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onState(state);
  }

  private snapshot(): DictationSnapshot {
    return { final: joinSpoken(this.committed, this.currentFinal), interim: this.currentInterim };
  }

  private open(): void {
    const recognition = new this.options.Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = this.options.lang;
    this.currentFinal = '';
    this.currentInterim = '';
    this.heardThisInstance = false;

    recognition.onstart = () => {
      if (this.recognition !== recognition) return;
      if (this.state === 'requesting') this.setState('listening');
    };
    recognition.onresult = (event) => {
      if (this.recognition !== recognition) return;
      // Rebuild from the full result list every time: resultIndex-based
      // appending is what duplicates or drops phrases when a result is revised.
      let finals = '';
      let interim = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result?.[0]?.transcript ?? '';
        if (!text.trim()) continue;
        if (result.isFinal) finals = joinSpoken(finals, text);
        else interim = joinSpoken(interim, text);
      }
      this.currentFinal = finals;
      this.currentInterim = interim;
      if (finals || interim) {
        this.heardThisInstance = true;
        this.idleRestarts = 0;
      }
      if (this.state === 'requesting') this.setState('listening');
      this.options.onSpoken(this.snapshot(), false);
    };
    recognition.onerror = (event) => {
      if (this.recognition !== recognition) return;
      const code = FATAL[event.error];
      if (code) this.fatal = code;
    };
    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      this.recognition = null;
      // Whatever the instance heard is kept, finalised or not, before any restart.
      this.committed = joinSpoken(joinSpoken(this.committed, this.currentFinal), this.currentInterim);
      this.currentFinal = '';
      this.currentInterim = '';

      if (this.state === 'stopping') {
        this.finish();
        return;
      }
      if (this.fatal) {
        this.fail(this.fatal);
        return;
      }
      if (!this.heardThisInstance) this.idleRestarts += 1;
      if (this.idleRestarts >= (this.options.maxIdleRestarts ?? 4)) {
        this.fail('no-speech');
        return;
      }
      this.options.onSpoken(this.snapshot(), false);
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        if (this.state === 'listening' || this.state === 'requesting') this.open();
      }, this.options.restartDelayMs ?? 150);
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      this.recognition = null;
      this.fail('failed');
    }
  }

  private fail(code: DictationErrorCode): void {
    this.clearRestart();
    const spoken = this.snapshot();
    this.detach();
    this.committed = '';
    this.setState('idle');
    this.options.onSpoken(spoken, true);
    this.options.onError(code);
  }

  private finish(): void {
    this.clearStop();
    const recognition = this.recognition;
    this.detach();
    try {
      recognition?.abort();
    } catch {
      // Already ended.
    }
    const spoken = {
      final: joinSpoken(joinSpoken(this.committed, this.currentFinal), this.currentInterim),
      interim: '',
    };
    this.committed = '';
    this.currentFinal = '';
    this.currentInterim = '';
    this.setState('idle');
    this.options.onSpoken(spoken, true);
  }

  private detach(): void {
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    }
  }

  private clearRestart(): void {
    if (this.restartTimer !== null) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private clearStop(): void {
    if (this.stopTimer !== null) clearTimeout(this.stopTimer);
    this.stopTimer = null;
  }
}
