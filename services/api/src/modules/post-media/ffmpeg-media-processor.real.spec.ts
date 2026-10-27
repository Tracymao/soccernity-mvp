import { ConfigService } from '@nestjs/config';
import { execFileSync, spawnSync } from 'child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { FfmpegMediaProcessor } from './ffmpeg-media-processor';
import { UnprocessableMediaError } from './media-processor';
import { PostMediaConfig } from './post-media.config';

// The REAL ffmpeg / ffprobe path of FfmpegMediaProcessor (probe, metadata-stripping remux, frame sampling).
// It runs only where the two tools exist -- FFMPEG_PATH / FFPROBE_PATH, or `ffmpeg` / `ffprobe` on PATH --
// and is skipped (visibly) everywhere else, so CI hosts without ffmpeg stay green. The fail-closed behaviour
// when the tools are MISSING is covered unconditionally in ffmpeg-media-processor.spec.ts.
const FFMPEG = process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH?.trim() || 'ffprobe';
const available = [FFMPEG, FFPROBE].every((bin) => {
  const r = spawnSync(bin, ['-version'], { windowsHide: true });
  return r.status === 0;
});

const suite = available ? describe : describe.skip;
if (!available) {
  // eslint-disable-next-line no-console
  console.warn('[ffmpeg-media-processor.real.spec] ffmpeg/ffprobe not found -- real-tool tests SKIPPED.');
}

suite('FfmpegMediaProcessor with the real ffmpeg / ffprobe', () => {
  let dir: string;
  const processor = new FfmpegMediaProcessor(new PostMediaConfig(new ConfigService({ FFMPEG_PATH: FFMPEG, FFPROBE_PATH: FFPROBE })));

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ffmpeg-real-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const ff = (args: string[]) => execFileSync(FFMPEG, ['-nostdin', '-y', '-v', 'error', ...args], { windowsHide: true });
  const probeJson = (file: string): { format: { tags?: Record<string, string>; duration?: string }; streams: { codec_type: string; tags?: Record<string, string> }[] } =>
    JSON.parse(
      execFileSync(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { windowsHide: true }).toString('utf8'),
    );

  /** A 2 s clip with video + audio and loud metadata (title, GPS-like location, comment, stream handler names). */
  async function makeSample(name: string, container: 'mp4' | 'mov'): Promise<string> {
    const out = path.join(dir, name);
    ff([
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=64x64:rate=10',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'mpeg4', '-c:a', 'aac', '-shortest',
      '-metadata', 'title=SECRET_TITLE',
      '-metadata', 'comment=SECRET_COMMENT',
      '-metadata', 'location=+51.5072-0.1276/',
      '-metadata:s:v:0', 'handler_name=SECRET_HANDLER',
      '-movflags', 'use_metadata_tags',
      '-f', container,
      out,
    ]);
    return out;
  }

  it('probes duration and the presence of a video stream', async () => {
    const file = await makeSample('probe.mp4', 'mp4');
    const probe = await processor.probeVideo(file);
    expect(probe.hasVideoStream).toBe(true);
    expect(probe.durationSeconds).toBeGreaterThan(1.5);
    expect(probe.durationSeconds).toBeLessThan(2.6);
  });

  it('reports an audio-only file as having no video stream, and a non-media file as unprocessable', async () => {
    const audio = path.join(dir, 'a.m4a');
    ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'aac', audio]);
    expect((await processor.probeVideo(audio)).hasVideoStream).toBe(false);

    const junk = path.join(dir, 'junk.mp4');
    await writeFile(junk, Buffer.from('this is not a video at all'));
    await expect(processor.probeVideo(junk)).rejects.toBeInstanceOf(UnprocessableMediaError);
  });

  it.each([
    ['mp4', 'video/mp4'],
    ['mov', 'video/quicktime'],
  ] as const)('remuxes a %s WITHOUT its metadata (title, location, comment, handler names are really gone) and without transcoding', async (container, type) => {
    const input = await makeSample(`strip.${container}`, container);
    const before = probeJson(input);
    expect(JSON.stringify(before)).toMatch(/SECRET_TITLE/); // the sample really carries it
    expect((await readFile(input)).toString('latin1')).toContain('SECRET_TITLE');

    const output = path.join(dir, `stripped.${container}`);
    await processor.stripVideo(input, output, type);

    const after = probeJson(output);
    const bytes = (await readFile(output)).toString('latin1');
    for (const secret of ['SECRET_TITLE', 'SECRET_COMMENT', 'SECRET_HANDLER', '+51.5072']) {
      expect(JSON.stringify(after)).not.toContain(secret);
      expect(bytes).not.toContain(secret);
    }
    // same streams (a copy, not a re-encode): one video, one audio, same codecs
    const kinds = (j: typeof before) => j.streams.map((s) => s.codec_type).sort();
    expect(kinds(after)).toEqual(['audio', 'video']);
    expect(execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', output], { windowsHide: true }).toString().trim()).toBe(
      execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', input], { windowsHide: true }).toString().trim(),
    );
    expect((await stat(output)).size).toBeGreaterThan(0);
    expect((await processor.probeVideo(output)).durationSeconds).toBeGreaterThan(1.5);
  });

  it('remuxes a webm without its metadata (skipped where this ffmpeg build cannot encode vp8/vorbis to make a sample)', async () => {
    const input = path.join(dir, 'strip.webm');
    try {
      ff([
        '-f', 'lavfi', '-i', 'testsrc=duration=2:size=64x64:rate=10',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
        '-c:v', 'libvpx', '-c:a', 'libvorbis', '-shortest',
        '-metadata', 'title=SECRET_TITLE',
        input,
      ]);
    } catch {
      return; // this build has no libvpx/libvorbis: nothing to remux
    }
    const output = path.join(dir, 'stripped.webm');
    await processor.stripVideo(input, output, 'video/webm');
    expect(JSON.stringify(probeJson(output))).not.toContain('SECRET_TITLE');
    expect((await readFile(output)).toString('latin1')).not.toContain('SECRET_TITLE');
    expect((await processor.probeVideo(output)).hasVideoStream).toBe(true);
  });

  it('refuses to strip a file that is not a video (UnprocessableMediaError), leaving no usable output', async () => {
    const junk = path.join(dir, 'junk2.mp4');
    await writeFile(junk, Buffer.from('nope'));
    await expect(processor.stripVideo(junk, path.join(dir, 'junk2.out.mp4'), 'video/mp4')).rejects.toBeInstanceOf(UnprocessableMediaError);
  });

  it('extracts one JPEG per requested time', async () => {
    const file = await makeSample('frames.mp4', 'mp4');
    const frames = await processor.extractFrames(file, [0.2, 1.0, 1.8]);
    expect(frames).toHaveLength(3);
    for (const f of frames) {
      expect(f.length).toBeGreaterThan(100);
      expect([f[0], f[1], f[2]]).toEqual([0xff, 0xd8, 0xff]);
    }
  });

  it('assertVideoToolsAvailable passes when the tools exist', async () => {
    await expect(processor.assertVideoToolsAvailable()).resolves.toBeUndefined();
  });
});
