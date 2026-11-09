import { AudioBufferSink, type InputAudioTrack } from "mediabunny";

/**
 * Decodes part of an audio track into one buffer at the track's own sample rate. `from` is in the
 * track's timestamps; the result is `length` seconds long (silence where the track has no audio).
 */
export async function decodeRange(
  track: InputAudioTrack,
  from: number,
  length: number,
  signal: AbortSignal,
  onProgress: (fraction: number) => void = () => {},
): Promise<AudioBuffer | null> {
  const to = from + length;
  let out: Float32Array[] | null = null;
  let rate = 0;

  for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(from, to)) {
    if (signal.aborted) throw signal.reason;
    if (!out) {
      rate = buffer.sampleRate;
      const samples = Math.ceil(length * rate);
      out = Array.from({ length: buffer.numberOfChannels }, () => new Float32Array(samples));
    }
    // Where this packet lands in our range; the first one may start before `from`.
    const at = Math.round((timestamp - from) * rate);
    const skip = Math.max(0, -at);
    const space = out[0]!.length - Math.max(0, at);
    const count = Math.min(buffer.length - skip, space);
    if (count <= 0) continue;
    for (let ch = 0; ch < out.length; ch++) {
      const data = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
      out[ch]!.set(data.subarray(skip, skip + count), Math.max(0, at));
    }
    onProgress(Math.min(1, (timestamp + buffer.duration - from) / length));
  }

  if (!out || !out[0]!.length) return null;
  const result = new AudioBuffer({
    numberOfChannels: out.length,
    length: out[0]!.length,
    sampleRate: rate,
  });
  out.forEach((data, ch) => result.copyToChannel(data as Float32Array<ArrayBuffer>, ch));
  return result;
}

/** A copy of `length` samples of a buffer, starting at sample `start`. */
export function sliceAudio(buffer: AudioBuffer, start: number, length: number): AudioBuffer {
  const slice = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length,
    sampleRate: buffer.sampleRate,
  });
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    slice.copyToChannel(buffer.getChannelData(ch).subarray(start, start + length), ch);
  }
  return slice;
}
