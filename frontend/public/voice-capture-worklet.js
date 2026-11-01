// Forwards raw microphone samples to the page in small batches. It keeps no
// audio after posting and makes no network requests.
class XrogaVoiceTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.batch = new Float32Array(2048);
    this.used = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let at = 0; at < channel.length; ) {
      const take = Math.min(channel.length - at, this.batch.length - this.used);
      this.batch.set(channel.subarray(at, at + take), this.used);
      this.used += take;
      at += take;
      if (this.used === this.batch.length) {
        const out = this.batch;
        this.batch = new Float32Array(2048);
        this.used = 0;
        this.port.postMessage(out, [out.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('xroga-voice-tap', XrogaVoiceTap);
