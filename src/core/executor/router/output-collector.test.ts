// src/core/executor/router/output-collector.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { OutputCollector } from './output-collector';

describe('OutputCollector', () => {
  let collector: OutputCollector;

  beforeEach(() => {
    collector = new OutputCollector();
  });

  describe('text collection', () => {
    it('should append text', () => {
      collector.append('Hello');
      collector.append('World');
      expect(collector.snapshot().text).toBe('Hello\nWorld');
    });

    it('should set main output', () => {
      collector.append('Old content');
      collector.setMainOutput('New content');
      expect(collector.snapshot().text).toBe('New content');
    });
  });

  describe('tool result handling', () => {
    it('should append normal tool result', () => {
      collector.appendToolResult('file content', false);
      expect(collector.snapshot().text).toBe('[tool] file content');
    });

    it('should append error tool result', () => {
      collector.appendToolResult('permission denied', true);
      expect(collector.snapshot().text).toBe('[tool error] permission denied');
    });
  });

  describe('hook progress', () => {
    it('should append hook progress', () => {
      collector.appendHookProgress('PreToolUse', 'Starting');
      expect(collector.snapshot().text).toBe('[hook:PreToolUse] Starting');
    });
  });

  describe('structured output', () => {
    it('should store structured output', () => {
      const data = { key: 'value' };
      collector.setStructuredOutput(data);
      expect(collector.snapshot().structuredOutput).toEqual(data);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      collector.append('text');
      collector.setStructuredOutput({});
      collector.reset();
      const snapshot = collector.snapshot();
      expect(snapshot.text).toBe('');
      expect(snapshot.structuredOutput).toBeUndefined();
    });
  });
});
