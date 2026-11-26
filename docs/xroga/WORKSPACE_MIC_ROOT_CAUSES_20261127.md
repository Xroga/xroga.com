# Workspace microphone: root causes, November 27, 2026

Base: `ea341547906b` on `codex/workspace-release-compat-20261122`.

## Live path

The production dashboard bundle on xroga.com was read in desktop Chrome on November 27. It contains the
AudioWorklet capture path and reads `NEXT_PUBLIC_VOICE_ENGINE` at run time through the empty process shim, so the
browser speech fallback is not selected when AudioWorklet capture is available. Desktop Chrome therefore uses:
`XrogaVoiceControl` → `voiceCapture` → `voiceSegmenter` → `voiceApi` → `POST /api/voice/transcribe-free` →
Cloudflare `@cf/openai/whisper-large-v3-turbo`. `NEXT_PUBLIC_VOICE_TRANSCRIPTION_MODE` is read by no source file.

## iOS

| Cause | Evidence | Repair |
| --- | --- | --- |
| `voiceApi.ts` called `AbortSignal.any`, which Safari ships only from iOS 17.4. On older iOS the call throws `TypeError` before the upload, and the control reports it as a lost connection. | The new test runs the real `voiceApi.ts` with an `AbortSignal` that has no `any`. It fails on the base source with `TypeError: AbortSignal.any is not a function`. | `voiceDeadline` combines timeout and cancellation with `AbortController`. |
| Any audio context state other than `running` ended the recording at once. Safari uses `interrupted` and `suspended` for passing audio route changes. | Source of `openVoiceCapture` and a failing test on the base source. Not reproduced on an iPhone. | Capture resumes the context first and ends only if it is not running within two seconds. A closed context still ends at once. |
| `context.resume()` was awaited with no limit, so a resume that never settles left the control waiting. | Failing test on the base source. Not reproduced on an iPhone. | Start is bounded to four seconds, then fails clearly and releases the microphone. |
| The media stream source node was not referenced after connection, a known risk of early garbage collection. | Source reading only. | The capture keeps its audio nodes referenced. |

The report did not say which iOS version or which message appeared, so none of these is confirmed as the cause of
that particular failure.

## Mixed English, Urdu and Hindi (not repaired by this change)

- Each segment is one Whisper request. `voiceFree.ts` sends no `language`, so the model picks one language for the
  audio and decodes the whole request under it.
- The only `initial_prompt` is a list of English product terms. Its effect on mixed speech has not been measured.
- A segment is cut only at a pause after six seconds, so a switch inside a short sentence stays in one request.
  The measurements noted in `voiceSegmenter.ts` found that a mixed window can keep as little as none of one
  language. They were not re-run here.
- The browser sends audio only. No frontend change can alter how a request is decoded without splitting speech
  below the six second minimum, which that same note records as harming Hindi.

A repair needs a change to `backend/src/routes/voiceFree.ts`, which is bound by manual security review records, a
backend release, and real provider measurements on English, Urdu, Hindi and mixed audio. Each needs founder
approval. No transcription quality claim is made here.

## Untested

Physical iPhone or Safari, real microphone speech, real provider calls, and any mixed-language accuracy.
