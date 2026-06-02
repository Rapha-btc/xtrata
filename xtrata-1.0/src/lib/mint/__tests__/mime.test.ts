import { describe, expect, it } from 'vitest';
import {
  detectWebmTrackKind,
  resolveInscriptionMimeType
} from '../mime';

const webmBytes = (marker: string) =>
  new Uint8Array([
    0x1a,
    0x45,
    0xdf,
    0xa3,
    ...Array.from(marker).map((char) => char.charCodeAt(0))
  ]);

describe('mint mime helpers', () => {
  it('detects audio-only WebM payloads from codec markers', () => {
    expect(detectWebmTrackKind(webmBytes('A_OPUS'))).toBe('audio');
  });

  it('keeps WebM payloads with video markers as video', () => {
    expect(detectWebmTrackKind(webmBytes('A_OPUS-V_VP9'))).toBe('video');
  });

  it('canonicalizes .weba uploads as audio even when the browser reports video/webm', () => {
    expect(
      resolveInscriptionMimeType({
        fileName: 'loop.weba',
        declaredMimeType: 'video/webm',
        bytes: webmBytes('A_OPUS')
      })
    ).toBe('audio/webm; codecs=opus');
  });

  it('canonicalizes audio-only .webm uploads when the browser reports video/webm', () => {
    expect(
      resolveInscriptionMimeType({
        fileName: 'browser-blob.webm',
        declaredMimeType: 'video/webm',
        bytes: webmBytes('A_OPUS')
      })
    ).toBe('audio/webm; codecs=opus');
  });

  it('uses audio MIME for .opus files when the browser reports a generic type', () => {
    expect(
      resolveInscriptionMimeType({
        fileName: 'sample.opus',
        declaredMimeType: 'application/octet-stream'
      })
    ).toBe('audio/ogg; codecs=opus');
  });
});
