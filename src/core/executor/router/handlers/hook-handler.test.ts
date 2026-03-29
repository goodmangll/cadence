// src/core/executor/router/handlers/hook-handler.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { HookHandler } from './hook-handler';
import { StateManager } from '../state-manager';
import { OutputCollector } from '../output-collector';
import type { SDKHookResponseMessage, SDKAuthStatusMessage } from '@anthropic-ai/claude-agent-sdk';

describe('HookHandler', () => {
  let handler: HookHandler;
  let state: StateManager;
  let output: OutputCollector;

  beforeEach(() => {
    state = new StateManager();
    output = new OutputCollector();
    handler = new HookHandler(state, output);
  });

  describe('canHandle', () => {
    it('should handle system messages', () => {
      const msg = { type: 'system', subtype: 'init' } as unknown as SDKHookResponseMessage;
      expect(handler.canHandle(msg)).toBe(true);
    });

    it('should handle auth_status messages', () => {
      const msg = { type: 'auth_status', isAuthenticating: false, output: [] } as unknown as SDKAuthStatusMessage;
      expect(handler.canHandle(msg)).toBe(true);
    });

    it('should not handle other message types', () => {
      const msg = { type: 'assistant' } as unknown as SDKHookResponseMessage;
      expect(handler.canHandle(msg)).toBe(false);
    });
  });

  describe('hook_response handling', () => {
    it('should record hook event on success', () => {
      const msg = {
        type: 'system',
        subtype: 'hook_response',
        hook_name: 'PreToolUse',
        hook_event: 'PreToolUse',
        stdout: 'Running hook',
        stderr: '',
        exit_code: 0,
      } as unknown as SDKHookResponseMessage;

      handler.handle(msg);

      expect(state.snapshot().hookEvents).toHaveLength(1);
      expect(state.snapshot().hookEvents[0].name).toBe('PreToolUse');
      expect(state.hasErrors()).toBe(false);
    });

    it('should detect hook error on non-zero exit code', () => {
      const msg = {
        type: 'system',
        subtype: 'hook_response',
        hook_name: 'PreToolUse',
        hook_event: 'PreToolUse',
        stdout: '',
        stderr: 'Hook failed',
        exit_code: 1,
      } as unknown as SDKHookResponseMessage;

      handler.handle(msg);

      expect(state.hasErrors()).toBe(true);
      expect(state.getPrimaryError()?.type).toBe('hook_error');
      expect(state.getPrimaryError()?.hookName).toBe('PreToolUse');
    });

    it('should record hook event with exit code on success', () => {
      const msg = {
        type: 'system',
        subtype: 'hook_response',
        hook_name: 'PostToolUse',
        hook_event: 'PostToolUse',
        stdout: 'Hook completed',
        stderr: '',
        exit_code: 0,
      } as unknown as SDKHookResponseMessage;

      handler.handle(msg);

      expect(state.snapshot().hookEvents).toHaveLength(1);
      expect(state.snapshot().hookEvents[0].exitCode).toBe(0);
      expect(state.snapshot().hookEvents[0].output).toBe('Hook completed');
    });
  });

  describe('auth_status handling', () => {
    it('should detect auth error', () => {
      const msg = {
        type: 'auth_status',
        isAuthenticating: false,
        output: [],
        error: 'Invalid API key',
      } as unknown as SDKAuthStatusMessage;

      handler.handle(msg);

      expect(state.hasErrors()).toBe(true);
      expect(state.getPrimaryError()?.type).toBe('auth_error');
      expect(state.getPrimaryError()?.message).toContain('Invalid API key');
    });

    it('should not add error when auth is successful', () => {
      const msg = {
        type: 'auth_status',
        isAuthenticating: false,
        output: [],
        error: undefined,
      } as unknown as SDKAuthStatusMessage;

      handler.handle(msg);

      expect(state.hasErrors()).toBe(false);
    });
  });

  describe('output collector integration', () => {
    it('should append hook progress on success', () => {
      const msg = {
        type: 'system',
        subtype: 'hook_response',
        hook_name: 'PreToolUse',
        hook_event: 'PreToolUse',
        stdout: 'Running hook',
        stderr: '',
        exit_code: 0,
      } as unknown as SDKHookResponseMessage;

      handler.handle(msg);

      expect(output.snapshot().text).toContain('[hook:PreToolUse]');
      expect(output.snapshot().text).toContain('Completed');
    });

    it('should append hook error progress on failure', () => {
      const msg = {
        type: 'system',
        subtype: 'hook_response',
        hook_name: 'PreToolUse',
        hook_event: 'PreToolUse',
        stdout: '',
        stderr: 'Hook failed',
        exit_code: 1,
      } as unknown as SDKHookResponseMessage;

      handler.handle(msg);

      expect(output.snapshot().text).toContain('[hook:PreToolUse]');
      expect(output.snapshot().text).toContain('Error: exit code 1');
    });

    it('should append auth error to output', () => {
      const msg = {
        type: 'auth_status',
        isAuthenticating: false,
        output: [],
        error: 'Invalid API key',
      } as unknown as SDKAuthStatusMessage;

      handler.handle(msg);

      expect(output.snapshot().text).toContain('[auth error] Invalid API key');
    });
  });
});
