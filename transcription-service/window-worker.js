import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { pipeline } from '@xenova/transformers';

function decodeAudioWindowToFloat32(audioPath, sampleRate, offsetSeconds, durationSeconds) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(Math.max(0, offsetSeconds)),
      '-t',
      String(Math.max(0.1, durationSeconds)),
      '-i',
      audioPath,
      '-f',
      'f32le',
      '-acodec',
      'pcm_f32le',
      '-ac',
      '1',
      '-ar',
      String(sampleRate),
      'pipe:1',
    ]);

    const stdoutChunks = [];
    const stderrChunks = [];

    ffmpeg.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    ffmpeg.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    ffmpeg.on('error', (err) => reject(new Error(`Failed to start ffmpeg: ${err.message}`)));
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        const details = Buffer.concat(stderrChunks).toString('utf8').trim();
        reject(new Error(`ffmpeg window decode failed (exit ${code})${details ? `: ${details}` : ''}`));
        return;
      }

      const decoded = Buffer.concat(stdoutChunks);
      if (decoded.length === 0) {
        reject(new Error('ffmpeg window decode produced no audio output'));
        return;
      }

      const alignedLength = decoded.length - (decoded.length % 4);
      const aligned = alignedLength === decoded.length ? decoded : decoded.subarray(0, alignedLength);
      const view = new Float32Array(aligned.buffer, aligned.byteOffset, aligned.length / 4);
      resolve(new Float32Array(view));
    });
  });
}

function parseReturnTimestamps(value) {
  if (value === 'word') return 'word';
  if (value === 'segment') return true;
  return false;
}

async function main() {
  const [
    audioPath,
    outputPath,
    offsetSecondsRaw,
    durationSecondsRaw,
    modelName,
    device,
    quantizedRaw,
    sampleRateRaw,
    returnTimestampsRaw,
    language,
  ] = process.argv.slice(2);

  const offsetSeconds = Number.parseFloat(offsetSecondsRaw);
  const durationSeconds = Number.parseFloat(durationSecondsRaw);
  const sampleRate = Number.parseInt(sampleRateRaw, 10);
  const quantized = quantizedRaw === 'true';
  const returnTimestamps = parseReturnTimestamps(returnTimestampsRaw);

  if (!audioPath || !outputPath || !modelName || !device || !Number.isFinite(offsetSeconds) || !Number.isFinite(durationSeconds) || !Number.isFinite(sampleRate)) {
    throw new Error('window-worker received invalid arguments');
  }

  const transcriber = await pipeline('automatic-speech-recognition', modelName, {
    device,
    quantized,
  });

  try {
    const audioSamples = await decodeAudioWindowToFloat32(audioPath, sampleRate, offsetSeconds, durationSeconds);
    const result = await transcriber(audioSamples, {
      task: 'transcribe',
      return_timestamps: returnTimestamps,
      chunk_length_s: 0,
      stride_length_s: 0,
      ...(language ? { language } : {}),
    });

    await fs.writeFile(outputPath, JSON.stringify({
      text: String(result?.text || '').trim(),
      chunks: Array.isArray(result?.chunks) ? result.chunks : [],
    }));
  } finally {
    if (typeof transcriber.dispose === 'function') {
      await transcriber.dispose();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
