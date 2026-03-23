import { describe, it, expect } from 'vitest';
import os from 'os';
import { OptionsBuilder } from './options-builder';
import { createTask } from '../../models/task';

describe('OptionsBuilder', () => {
  describe('expandPath', () => {
    it('should expand ~ to homedir', () => {
      const task = createTask({
        id: 'test',
        name: 'Test',
        execution: {
          command: 'test',
          workingDir: '~',
        },
      });
      const options = OptionsBuilder.build(task);
      expect(options.cwd).toBe(os.homedir());
    });

    it('should expand ~/path to homedir/path', () => {
      const task = createTask({
        id: 'test',
        name: 'Test',
        execution: {
          command: 'test',
          workingDir: '~/foo/bar',
        },
      });
      const options = OptionsBuilder.build(task);
      expect(options.cwd).toBe(os.homedir() + '/foo/bar');
    });

    it('should not modify absolute paths', () => {
      const task = createTask({
        id: 'test',
        name: 'Test',
        execution: {
          command: 'test',
          workingDir: '/absolute/path',
        },
      });
      const options = OptionsBuilder.build(task);
      expect(options.cwd).toBe('/absolute/path');
    });

    it('should not modify relative paths', () => {
      const task = createTask({
        id: 'test',
        name: 'Test',
        execution: {
          command: 'test',
          workingDir: './relative/path',
        },
      });
      const options = OptionsBuilder.build(task);
      expect(options.cwd).toBe('./relative/path');
    });

    it('should return undefined when workingDir is not set', () => {
      const task = createTask({
        id: 'test',
        name: 'Test',
        execution: {
          command: 'test',
        },
      });
      const options = OptionsBuilder.build(task);
      expect(options.cwd).toBeUndefined();
    });
  });
});
