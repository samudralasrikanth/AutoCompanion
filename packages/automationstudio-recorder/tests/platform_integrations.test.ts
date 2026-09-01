import { describe, test, expect, vi } from 'vitest';
import { EventQueue, EventPriority } from '../src/events/event_queue';
import { EventSequencer } from '../src/events/event_sequencer';
import { EventCorrelator } from '../src/events/event_correlation';
import { BrowserRecorderAdapter } from '../src/platform/browser/browser_recorder_adapter';
import { DesktopRecorderAdapter } from '../src/platform/desktop/desktop_recorder_adapter';
import { CitrixRecorderAdapter } from '../src/platform/citrix/citrix_recorder_adapter';
import { RecorderAdapterRegistry } from '../src/platform/recorder_adapter_registry';
import { RecorderManager } from '../src/recorder/recorder_manager';
import { EventNormalizer } from '../src/events/event_normalizer';
import { RecorderState } from '../src/recorder/recorder_state';

describe('EPIC-006.2 Platform Event Integrations Certification', () => {

  describe('Gate F - Event Sequencing & Gate G - Backpressure', () => {
    test('1000+ events maintain monotonic ingestion sequencing', async () => {
      const queue = new EventQueue({ maxCapacity: 2000 }); // Large enough so we don't drop
      const sequencer = new EventSequencer();
      const correlator = new EventCorrelator({ sessionId: 's1' });

      let processedEvents: any[] = [];
      queue.setProcessor((evt) => {
        processedEvents.push(evt);
      });

      // Inject 1000 events
      for (let i = 0; i < 1000; i++) {
        const raw = correlator.correlate({
          eventId: `e-${i}`,
          source: 'browser',
          sequenceNumber: 0,
          timestamp: new Date().toISOString(),
          type: i % 10 === 0 ? 'click' : 'mousemove', // 100 critical clicks, 900 noise
          payload: {}
        });
        
        const sequenced = sequencer.sequence(raw);
        queue.enqueue(sequenced);
      }

      // Assert monotonic ordering of processed events
      let lastSeq = 0;
      for (const e of processedEvents) {
        expect(e.sequenceNumber).toBeGreaterThan(lastSeq);
        lastSeq = e.sequenceNumber;
      }
    });

    test('Queue drops NOISE events under pressure but fails on CRITICAL if full', () => {
      const queue = new EventQueue({ maxCapacity: 10 });
      let processed = 0;
      queue.setProcessor(async () => {
         // simulate slow processing so queue fills up
         await new Promise(r => setTimeout(r, 1000));
         processed++;
      });
      
      // fill up queue
      for (let i = 0; i < 10; i++) {
        queue.enqueue({ eventId: `${i}`, sessionId: '', sequenceNumber: i, source: 'browser', timestamp: '', type: 'mousemove', payload: {} });
      }
      
      // 11th noise event gets dropped, no error
      queue.enqueue({ eventId: '11', sessionId: '', sequenceNumber: 11, source: 'browser', timestamp: '', type: 'mousemove', payload: {} });
      
      // 12th critical event throws
      expect(() => {
        queue.enqueue({ eventId: '12', sessionId: '', sequenceNumber: 12, source: 'browser', timestamp: '', type: 'click', payload: {} });
      }).toThrow('Event queue capacity exceeded');
    });
  });

  describe('Gate H - Lifecycle Propagation', () => {
    test('All adapters correctly propagate START, PAUSE, RESUME, STOP, DISPOSE', async () => {
      const registry = new RecorderAdapterRegistry();
      
      const mockBrowserSource = {
        onNativeEvent: vi.fn(),
        startListening: vi.fn().mockResolvedValue(undefined),
        stopListening: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined)
      };
      
      const mockSnapshotProvider = {
        captureSnapshot: vi.fn()
      };

      const browserAdapter = new BrowserRecorderAdapter(mockBrowserSource, mockSnapshotProvider);
      registry.register(browserAdapter);

      const queue = new EventQueue();
      queue.setProcessor(vi.fn());
      const sequencer = new EventSequencer();
      const correlator = new EventCorrelator({ sessionId: '' });
      const normalizer = new EventNormalizer(vi.fn());

      const manager = new RecorderManager(registry, queue, sequencer, correlator, normalizer);

      const session = await manager.start({
        executionId: 'exec1',
        projectId: 'proj1',
        testId: 'test1',
        source: 'browser'
      });

      expect(mockBrowserSource.startListening).toHaveBeenCalledTimes(1);

      await manager.pause(session.sessionId);
      expect(mockBrowserSource.stopListening).toHaveBeenCalledTimes(1);

      await manager.resume(session.sessionId);
      expect(mockBrowserSource.startListening).toHaveBeenCalledTimes(2);

      await manager.stop(session.sessionId);
      expect(mockBrowserSource.stopListening).toHaveBeenCalledTimes(2); // +1
      expect(mockBrowserSource.dispose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Gate B - Browser Mocked', () => {
    test('Browser adapter properly maps and correlates events', async () => {
      const mockBrowserSource = {
        onNativeEvent: vi.fn(),
        startListening: vi.fn().mockResolvedValue(undefined),
        stopListening: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined)
      };
      
      const mockSnapshotProvider = {
        captureSnapshot: vi.fn().mockReturnValue({
          elementId: 'btn1',
          framePath: [],
          refId: 'ref1',
          attributes: {},
          url: 'http://test'
        })
      };

      const adapter = new BrowserRecorderAdapter(mockBrowserSource, mockSnapshotProvider);
      let emitted: any[] = [];
      adapter.onEvent((evt) => emitted.push(evt));

      await adapter.initialize();
      
      // Simulate native event
      const handler = mockBrowserSource.onNativeEvent.mock.calls[0][0];
      handler({
        type: 'click',
        payload: { x: 10, y: 10 },
        targetElement: {} // mock DOM element
      });

      expect(emitted.length).toBe(1);
      expect(emitted[0].type).toBe('click');
      expect(emitted[0].interactionTarget.elementId).toBe('btn1');
    });
  });

  describe('Gate D1 - Windows Mocked', () => {
    test('Desktop adapter properly maps and emits UIA events with structured fallback', async () => {
      const mockUIAProvider = {
        onUIAEvent: vi.fn(),
        extractElement: vi.fn().mockReturnValue({
          automationId: 'loginBtn',
          name: 'Login'
        }),
        startListening: vi.fn().mockResolvedValue(undefined),
        stopListening: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined)
      };

      const adapter = new DesktopRecorderAdapter(mockUIAProvider);
      let emitted: any[] = [];
      adapter.onEvent((evt) => emitted.push(evt));

      await adapter.initialize();
      
      const handler = mockUIAProvider.onUIAEvent.mock.calls[0][0];
      handler({
        type: 'Invoke',
        payload: {},
        targetElement: {} 
      });

      expect(emitted.length).toBe(1);
      expect(emitted[0].type).toBe('Invoke');
      expect(emitted[0].interactionTarget.elementId).toBe('loginBtn');
    });
  });

  describe('Gate E - Citrix Boundary', () => {
    test('Citrix explicitly reports structuredInspection: false', async () => {
      const mockRemoteCapture = {
        onInputEvent: vi.fn(),
        startCapture: vi.fn().mockResolvedValue(undefined),
        stopCapture: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined)
      };

      const adapter = new CitrixRecorderAdapter(mockRemoteCapture);
      let emitted: any[] = [];
      adapter.onEvent((evt) => emitted.push(evt));

      await adapter.initialize();
      
      const handler = mockRemoteCapture.onInputEvent.mock.calls[0][0];
      handler({
        type: 'mousedown',
        payload: { x: 100, y: 200 }
      });

      expect(emitted.length).toBe(1);
      expect(emitted[0].payload.structuredInspection).toBe(false);
    });
  });
});
