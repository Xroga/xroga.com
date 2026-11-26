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

Cause in the product path:

- Each segment is one Whisper request. `voiceFree.ts` sends no `language`, so the model picks one language for the
  audio and decodes the request under it.
- A segment is cut only at a pause after six seconds, so a switch inside a short sentence stays in one request.

Local reproduction on November 27 with founder approval: whisper.cpp large-v3-turbo q5_0 on eight spliced mixed
clips from public FLEURS recordings, plus two single-language clips each. This is not Cloudflare, not a microphone and
not natural code switching. Receipt: `evidence/workspace-mic-20261127/local-whisper-comparison.json`.

A mixed clip counts as kept when every spoken language appears as what was said, in any script. This is a manual
reading of the receipt.

| Setting | Mixed clips kept | Single-language effect |
| --- | --- | --- |
| Current vocabulary prompt | 3 of 8 | Urdu sometimes written in Devanagari |
| Prompt with three scripts | 2 of 8, one other clip translated | An Urdu clip moved to Devanagari |
| Romanised mixed prompt | 4 of 8, one other clip translated | An Urdu clip rewritten in Latin letters |
| Language forced to Urdu | Drops or garbles English | English clips lost |
| Language forced to Hindi | Drops or garbles part of most clips | English clips lost |

Three mixed clips lost a whole language under all three prompts. **No prompt or forced language setting is adopted.**
A repair needs a different recognition approach, most likely a model that handles switches inside one request. No
such model has been measured here. Any model change needs founder approval for provider and cost, a backend release
and rebinding the security review records of the voice route.

## Untested

Physical iPhone or Safari, real microphone speech, real provider calls, and mixed-language behaviour of the production provider.
