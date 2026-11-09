/**
 * Caps the threads ffmpeg starts. The multi-threaded engine has a fixed pool of 32 threads, and
 * ffmpeg normally sizes its decoders, filters and encoders to the number of CPU cores, which can
 * use up the pool and freeze. Decoders get 2 threads per input; filters and the encoder get 4.
 * The output file must be the last argument.
 */
export function limitThreads(args: readonly string[]): string[] {
  const out: string[] = [];
  args.forEach((arg, i) => {
    if (arg === "-i") out.push("-threads", "2");
    if (i === args.length - 1) out.push("-threads", "4", "-filter_threads", "2");
    out.push(arg);
  });
  return out;
}
