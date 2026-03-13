import { query } from '@anthropic-ai/claude-agent-sdk';
import * as path from 'path';

async function main() {
  console.log('=== Debug Agent SDK ===\n');

  const options: any = {
    cwd: '/home/linden/area/code/mine/cadence',
    settingSources: ['user', 'project'],
    maxTurns: 3,
    allowDangerouslySkipPermissions: true,
  };

  console.log('Calling query with prompt: "ls -la"');
  console.log('---\n');

  try {
    let messageCount = 0;
    for await (const message of query({
      prompt: 'ls -la',
      options,
    })) {
      messageCount++;
      console.log(`\n=== Message ${messageCount} ===`);
      console.log('Type:', message.type);
      console.log('Full message:', JSON.stringify(message, null, 2));
    }

    console.log(`\n---\nTotal messages: ${messageCount}`);
  } catch (e) {
    console.error('Error:', e);
  }
}

main().catch(console.error);
