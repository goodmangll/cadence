// src/core/executor/router/output-collector.ts

import type { CollectedOutput } from './types';

export class OutputCollector {
  private text: string = '';
  private structuredOutput: unknown = undefined;

  append(text: string): void {
    this.text += text + '\n';
  }

  appendToolResult(output: string, isError: boolean): void {
    if (isError) {
      this.text += `[tool error] ${output}\n`;
    } else {
      this.text += `[tool] ${output}\n`;
    }
  }

  appendHookProgress(hookName: string, output: string): void {
    this.text += `[hook:${hookName}] ${output}\n`;
  }

  setMainOutput(text: string): void {
    this.text = text + '\n';
  }

  setStructuredOutput(output: unknown): void {
    this.structuredOutput = output;
  }

  snapshot(): CollectedOutput {
    return {
      text: this.text.trim(),
      structuredOutput: this.structuredOutput,
    };
  }

  reset(): void {
    this.text = '';
    this.structuredOutput = undefined;
  }
}
