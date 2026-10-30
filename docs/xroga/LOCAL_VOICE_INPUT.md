# Local multilingual dictation

Development branch: `codex/multilingual-voice-input-20261030`.
Base: `e5768eeeee5c91bc31b2704243850fb896f0dfca`.
The founder authorized voice-only production activation on 2026-10-30. Other batch activation remains held. Current production must be preserved until the voice candidate passes release checks.

## Behavior

The existing microphone records until Stop, then inserts one editable transcript into the existing composer. Send remains manual. Repeated dictation appends to the latest draft, including edits made during recognition. Spoken words such as “send” are ordinary text. There is no language picker, voice conversation, TTS restart, browser-locale recognition, or paid API fallback.

The homepage, workspace and incognito controls use the same component. Conversation, project, account and incognito transitions invalidate the workspace recording. Manual submission, navigation and unmount cancel or invalidate pending work. Hiding the page cancels live capture. A stopped recording can finish while its tab is hidden. Late permission and transcript results cannot resume recording or insert text into another conversation.

## Implementation

`MediaRecorder` captures a bounded recording and awaits its final chunk and stop event. The browser decodes and resamples to mono 16 kHz. A dedicated context-owned worker runs pinned Transformers.js 3.8.1 and quantized multilingual Whisper. Executable JS/WASM is built locally with the frontend. Only pinned public weights are downloaded from Hugging Face.

Transformers.js 3 silently defaults to English when language is omitted. The adapter instead runs Whisper's first-token language detection and masks selection to the model's declared language tokens, then requests transcription in the detected language. It does not choose from the browser locale or translate into English. Decoder token exhaustion fails instead of reporting a truncated transcript as complete. Long recordings are split at quiet frames near model-window boundaries. Every sample belongs to exactly one contiguous segment. Each segment detects its language and is transcribed independently, then appended without text deduplication. The draft layer does not remove repeated words heuristically.

Raw recordings are not uploaded or retained by this feature. The recognized text follows the existing composer draft-saving and manual Send behavior. Model weights can be cached by the browser. The context-owned worker reuses only public model weights between dictations and terminates after two idle minutes, cancellation, navigation or failure. Audio buffers are cleared after recognition. A failed recording can remain in local RAM for an explicit retry for up to five minutes, then expires. No audio is persisted. Backend voice authorization and accounting remain intact for existing clients, but these microphone controls do not call that paid route.

Limits: thirty-minute recording with clean Stop and final-chunk preservation, 64 MiB encoded audio, 1805-second decoded validation margin, 15-second decode timeout. Recognition has a ten-minute preparation allowance plus six times the audio duration. Silence, malformed samples, interrupted recording and worker failures leave the existing draft intact. This is not a guarantee against recognition errors in noise or ambiguous speech.

## Verification

- The complete local frontend suite passed 1,295 tests after restoring the established microphone animation and updating page-policy and manual-dictation assertions. Application source: `9af1b227`. Final PR CI remains independently required.
- 66 focused regression tests passed, including cancel races, last audio chunks, draft editing, repeated words, account/chat invalidation, invalid worker output, token exhaustion, automatic language token selection, existing server authorization and accounting guards, and scoped CSP.
- Frontend TypeScript passed after correcting the new adapter types.
- The canonical Node 22.21.1 frontend production build passed with existing repository warnings using a bounded 6 GiB job ceiling. A preceding 4 GiB attempt exhausted its limit during type validation. Exact-source PR CI remains separate from this local result.
- Real Edge MediaRecorder and PCM normalization passed on desktop and mobile viewports using synthetic audio.
- Actual React control plus real recording passed with a stubbed recognizer on both viewports. This proves UI behavior, not speech accuracy or physical mobile-device support.
- Actual CPU/WASM recognition of the public JFK English recording passed the expected-phrase checks using Whisper Base. Cold download plus recognition took 61.3 seconds on this laptop.
- Public Urdu and Arabic FLEURS recordings exposed the English-default defect and then enabled comparison of local models. Exact references, hashes, outputs, timing and word-error measurements are in `evidence/local-voice-20261030/`. One sample per language is not a benchmark or a universal support claim.

The provisional Small model also completed real English and Hindi fixtures. English matched the reference with 0% word error on the single JFK clip. Hindi measured 43.3% word error on one validation clip. Cold English recognition including download took 183.3 seconds; the following Hindi clip took 57.4 seconds. These latency and quality results do not meet a claim of instant, reliable multilingual dictation.

The isolated worker suppresses upstream input-tensor error logging and returns only a generic failure. A dedicated regression test verifies that private audio features cannot be logged by that failure path.

## Release gate and limitations

The founder explicitly accepted Urdu/Hindi script ambiguity on 2026-10-30. Recognition errors remain measured limitations requiring editable review, not a promise of exact text. Base produced high word error rates. Small improved Arabic but selected Hindi script for the Urdu fixture. No production-quality Urdu or universal multilingual claim is supported by those results. The 776 MB Medium comparison failed inside the local runtime with error `1284783576`; its root cause is unconfirmed and it is not selected. Small remains a provisional development candidate, not a production acceptance claim.

Measured single-fixture word-error rates after automatic detection:

| Model | Urdu | Arabic | Disposition |
| --- | --- | --- | --- |
| Base q8 | 34.1% | 66.7% | Rejected for quality |
| Small q8 | 100%, Hindi script | 33.3% | Provisional code candidate, founder accepted script ambiguity; live verification pending |
| Medium q8 | Runtime failure | Not reached | Not selected |

These scores remove punctuation and use word-level edit distance. They do not establish performance on other speakers, dialects or tasks. They should not be read as a benchmark. The wrong-script Urdu result is an explicit unresolved failure.

Physical microphone permission/denial, real Android/iPhone/Safari/Firefox devices, background interruptions on those devices, mixed-language tasks, technical terms, silence/noise and long chunked utterances still require representative acceptance. A mobile-sized desktop viewport is not a physical-phone test.

The free model eliminates transcription API charges. Device compute, memory, battery, network download and browser storage are still real costs. It cannot promise error-free transcription. First use needs network access to the public model host, then cache reuse depends on browser storage availability. Unsupported devices receive an inline error and can continue typing.

## Reproduce and recovery

Use the repository's Node 22.21.1/npm 10.9.4 toolchain, `npm ci`, then `npm run build --workspace frontend`. The prebuild hook generates `frontend/public/voice-runtime/v1`, which is ignored and regenerable. Do not commit model binaries or recordings.

Run `scripts/verify-voice-control.mjs` for the actual recording/UI fixture and `scripts/verify-local-voice.mjs` for real local recognition. `--multilingual` uses public corpus audio. `--fixtures <task-owned-directory>` consumes a manifest and SHA-256-checked public WAV files. `--medium` is an isolated comparative probe, not a runtime setting. All browser/server processes close in `finally`. Use the local maintenance runner and preserve the small JSON receipts before it cleans temporary browser profiles.

For rollback, revert this bounded change before deployment or restore the previously verified frontend deployment. No database migration, IAM, model-provider balance or backend configuration changes are involved. Do not use the old paid route as a hidden fallback.

## Sources

- [Whisper implementation and license](https://github.com/openai/whisper)
- [Transformers.js Whisper language-detection limitation](https://github.com/huggingface/transformers.js/issues/302)
- [Google FLEURS corpus](https://huggingface.co/datasets/google/fleurs)

## Voice-only release scope

Live frontend baseline is d7ce7def4ab94a72587907cb4f60690d7f288838, deployment 9MEC7muKc5udcQqPn7oFJ3Z6rDEQ. Release branch codex/voice-only-production-20261030 applies only the microphone changes to that source. It must not replace production with unrelated current-main Batch 3 changes. Preserve the existing deployment as rollback. No backend deployment, production SQL, new service or paid speech request is included.

The first extended public-fixture test observed 12 of 13 repeated phrases under overlap merging. The replacement partitions audio without overlap, preserving all sample ranges and intentional repetitions. The same strict real-speech check must pass before release. Thirty-minute recording is a declared safety ceiling, not a claim of a physically tested thirty-minute dictation session.

The corrected long-speech test passed: 143 seconds, 13 expected repetitions and 13 recognized repetitions, zero audio uploads and zero paid requests. The CPU/WASM run took 585,956 ms including initial model preparation. This is one controlled English stress fixture, not a broad language or device benchmark.

The first production recording test exposed browser-codec amplitude overshoot. Actual MediaRecorder audio decoded to a peak of 1.01500535, exceeding the worker's 1.01 admission ceiling before any worker started. The source correction clamps finite decoded PCM to [-1, 1] before strict worker validation. Nonfinite data and invalid direct worker input remain rejected. Its regression failed before the fix and passed afterward. The public-fixture diagnostic receipt is `evidence/local-voice-20261030/browser-codec-overshoot-before.json`. Exact-source release checks and a fresh live recording check are required for the correction.

## User-reported failure and bounded repair, October 30

The user recording shows capture, then model setup after Stop, then an error and no transcript. The actual Chrome console reports Failed to fetch. This demonstrates a failed public-model download, not a successful recognition or a diagnosis of the speaker's language. The original recording and account screenshots remain local and are not committed.

This repair starts model preparation after capture begins, reuses the ready worker, retries interrupted public model setup once, and retains a failed recording for an explicit Retry without reacquiring the microphone. It fences replies by request ID and worker generation, stops tracks, preserves manual Send, expires retained audio after five minutes, and prevents a tab-visibility change from cancelling an already stopped recording. The compact status replaces the large technical model-download notice. Real permission and transcription failures remain visible.

Thirty focused tests passed. The real React control and MediaRecorder passed in desktop and mobile-sized Edge viewports with a stubbed recognizer, including retry of the same recording, worker reuse, editable draft, manual Send, hidden-tab finalization and denial of late results after changing chats. These are not physical-phone or language-quality claims.

An isolated Transformers.js 4.3.2 WebGPU comparison correctly recognized the public 11-second English clip, but warm recognition took 36,143 and 40,815 ms. Initial setup took 537,975 ms. It is not adopted. The repository keeps 3.8.1 and its matching self-hosted runtime. A strict immutable model transport used only by that comparison remains outside the production source. No broad CSP permission was added.

An isolated native whisper.cpp v1.9.2 Small q5_1 comparison transcribed public English, Hindi and Urdu recordings and detected en, hi and ur. End-to-end command times were 15,781, 18,047 and 17,375 ms on this laptop. These include loading the model for each command and do not establish Cloud Run latency. Recognition errors remain visible in the public receipts. No native service, backend route, IAM change or paid API was created.

This repair does not establish ChatGPT-equivalent latency or accuracy. First-use download reliability and real user acceptance still require live verification. The current production source is 98b87a7017e7d123b0baee33bfbbbeb15177e53f. The repair is not live merely because source checks pass.
