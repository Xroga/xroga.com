# Local multilingual dictation

Development branch: `codex/multilingual-voice-input-20261030`.
Base: `e5768eeeee5c91bc31b2704243850fb896f0dfca`.
The founder authorized voice-only production activation on 2026-10-30. Other batch activation remains held. Current production must be preserved until the voice candidate passes release checks.

## Behavior

The existing microphone records until Stop, then inserts one editable transcript into the existing composer. Send remains manual. Repeated dictation appends to the latest draft, including edits made during recognition. Spoken words such as “send” are ordinary text. There is no language picker, voice conversation, TTS restart, browser-locale recognition, or paid API fallback.

The homepage, workspace and incognito controls use the same component. Conversation, project, account and incognito transitions invalidate the workspace recording. Manual submission, navigation, a hidden page and unmount cancel or invalidate pending work. Late permission and transcript results cannot resume recording or insert text into another conversation.

## Implementation

`MediaRecorder` captures a bounded recording and awaits its final chunk and stop event. The browser decodes and resamples to mono 16 kHz. A dedicated disposable worker runs pinned Transformers.js 3.8.1 and quantized multilingual Whisper. Executable JS/WASM is built locally with the frontend. Only pinned public weights are downloaded from Hugging Face.

Transformers.js 3 silently defaults to English when language is omitted. The adapter instead runs Whisper's first-token language detection and masks selection to the model's declared language tokens, then requests transcription in the detected language. It does not choose from the browser locale or translate into English. Decoder token exhaustion fails instead of reporting a truncated transcript as complete. Overlapping audio chunks use the library's ASR merger. The draft layer does not remove repeated words heuristically.

Raw recordings are not uploaded or retained by this feature. The recognized text follows the existing composer draft-saving and manual Send behavior. Model weights can be cached by the browser. Worker termination releases the model and recording on completion, cancellation, timeout and failure. Backend voice authorization and accounting remain intact for existing clients, but these microphone controls do not call that paid route.

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
| Small q8 | 100%, Hindi script | 33.3% | Provisional code candidate, quality gate blocked |
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
