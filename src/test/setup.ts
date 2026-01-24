import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Runs cleanup after each test case
afterEach(() => {
  cleanup();
});

// Mock Web Audio API
class MockAudioContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 44100;
  
  createGain() {
    return {
      connect: vi.fn(),
      gain: { value: 1, setValueAtTime: vi.fn() },
    };
  }
  
  createAnalyser() {
    return {
      connect: vi.fn(),
      fftSize: 2048,
      frequencyBinCount: 1024,
      getByteFrequencyData: vi.fn(),
      getByteTimeDomainData: vi.fn(),
    };
  }
  
  createBufferSource() {
    return {
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      buffer: null,
    };
  }
  
  decodeAudioData() {
    return Promise.resolve({
      duration: 180,
      sampleRate: 44100,
      numberOfChannels: 2,
      length: 44100 * 180,
      getChannelData: () => new Float32Array(44100 * 180),
    });
  }
  
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

// @ts-expect-error - Mock global AudioContext
global.AudioContext = MockAudioContext;
// @ts-expect-error
global.webkitAudioContext = MockAudioContext;

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
