import { AgentSDKExecutor } from '../src/core/executor/agent-sdk-executor';

async function main() {
  console.log('=== Cadence Real Test ===\n');
  console.log('Environment variables:');
  console.log('  ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '(set)' : '(not set)');
  console.log('  ANTHROPIC_AUTH_TOKEN:', process.env.ANTHROPIC_AUTH_TOKEN ? '(set)' : '(not set)');
  console.log('  ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL || '(not set)');
  console.log('  ANTHROPIC_MODEL:', process.env.ANTHROPIC_MODEL || '(not set)');
  console.log();

  // 直接创建任务对象
  const task = {
    id: 'real-test-task',
    name: 'Real Test Task',
    enabled: true,
    trigger: { type: 'cron', expression: '* * * * *' },
    execution: {
      command: 'Just say hello and confirm you are working. Keep it very short.',
      workingDir: '/home/linden/area/code/mine/cadence',
      timeout: 300, // 5 minutes
      settingSources: ['user', 'project'],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  console.log('Task:', task.name);
  console.log('Command:', task.execution.command);
  console.log('Timeout:', task.execution.timeout, 'seconds');
  console.log('\nExecuting... (this may take a while)\n');

  const executor = new AgentSDKExecutor({ defaultTimeout: 300 });
  const result = await executor.execute(task as any);

  console.log('\n=== Result ===');
  console.log('Status:', result.status);
  console.log('Duration:', result.duration, 'ms');
  if (result.output) {
    console.log('\nOutput:');
    console.log(result.output);
  }
  if (result.error) {
    console.log('\nError:');
    console.log(result.error);
  }
}

main().catch(err => {
  console.error('\n=== Fatal Error ===');
  console.error(err);
  process.exit(1);
});
