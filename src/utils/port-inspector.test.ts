import { describe, it, expect } from 'vitest';
import { canConnectToPort, inspectPortUsage } from './port-inspector';
import * as net from 'net';

describe('port-inspector', () => {
  describe('canConnectToPort', () => {
    it('should return false for a port with no listener', async () => {
      // Use a port that's unlikely to be in use
      const result = await canConnectToPort(65535);
      expect(result).toBe(false);
    });
  });

  describe('inspectPortUsage', () => {
    it('should return port not in use for an unused port', async () => {
      const result = await inspectPortUsage(65535);
      expect(result.isPortInUse).toBe(false);
      expect(result.listeners).toEqual([]);
      expect(result.isCadence).toBe(false);
    });
  });
});
