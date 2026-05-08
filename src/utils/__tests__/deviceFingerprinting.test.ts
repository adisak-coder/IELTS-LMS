import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearCachedDeviceFingerprintForTesting,
  getDeviceFingerprint,
  hashFingerprint,
} from '../deviceFingerprinting';

describe('deviceFingerprinting', () => {
  afterEach(() => {
    clearCachedDeviceFingerprintForTesting();
    vi.restoreAllMocks();
  });

  it('returns a stable hash for the same session components', async () => {
    const components = {
      timezone: 'Asia/Bangkok',
      language: 'en-US',
      platform: 'MacIntel',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      screenResolution: '1440x900',
      colorDepth: 24,
      canvasHash: 'canvas-1',
      webglRenderer: 'renderer-1',
    };

    const firstHash = await hashFingerprint(components);
    const secondHash = await hashFingerprint(components);

    expect(firstHash).toBe(secondHash);
  });

  it('changes the hash when a relevant device signal changes', async () => {
    const baseComponents = {
      timezone: 'Asia/Bangkok',
      language: 'en-US',
      platform: 'MacIntel',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      screenResolution: '1440x900',
      colorDepth: 24,
      canvasHash: 'canvas-1',
      webglRenderer: 'renderer-1',
    };

    const baseHash = await hashFingerprint(baseComponents);
    const nextHash = await hashFingerprint({
      ...baseComponents,
      screenResolution: '1920x1080',
    });

    expect(nextHash).not.toBe(baseHash);
  });

  it('caches fingerprint generation to avoid creating repeated WebGL contexts', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    });

    const originalCreateElement = document.createElement.bind(document);
    const loseContext = vi.fn();
    const getContext = vi.fn((kind: string) => {
      if (kind === '2d') {
        return {
          textBaseline: '',
          font: '',
          fillStyle: '',
          fillRect: vi.fn(),
          fillText: vi.fn(),
        };
      }

      if (kind === 'webgl') {
        return {
          RENDERER: 0x1f01,
          getParameter: vi.fn((token: number) =>
            token === 0x1f01 ? 'Mock GPU Renderer' : 'Mock GPU Renderer',
          ),
          getExtension: vi.fn((name: string) => {
            if (name === 'WEBGL_debug_renderer_info') {
              return { UNMASKED_RENDERER_WEBGL: 0x9246 };
            }
            if (name === 'WEBGL_lose_context') {
              return { loseContext };
            }
            return null;
          }),
        };
      }

      return null;
    });

    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() !== 'canvas') {
          return originalCreateElement(tagName);
        }

        return {
          width: 240,
          height: 60,
          getContext,
          toDataURL: () => 'data:image/png;base64,AAAA',
        } as unknown as HTMLCanvasElement;
      });

    const first = await getDeviceFingerprint();
    const second = await getDeviceFingerprint();

    expect(second.hash).toBe(first.hash);
    expect(createElementSpy).toHaveBeenCalledTimes(2);
    expect(getContext).toHaveBeenCalledWith('webgl');
    expect(getContext).toHaveBeenCalledTimes(2);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });
});
