import { AgentSDKExecutor } from '../src/core/executor/agent-sdk-executor';

async function main() {
  console.log('=== Cadence Simple Test ===\n');

  // 直接创建任务对象，不通过 YAML
  const task = {
    id: 'simple-test-task',
    name: 'Simple Test Task',
    enabled: true,
    trigger: { type: 'cron', expression: '* * * * *' },
    execution: {
      command: 'ls -la',
      workingDir: '/home/linden/area/code/mine/cadence',
      timeout: 30,
      settingSources: ['user', 'project'],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  console.log('Task created:', task.name);
  console.log('Command:', task.execution.command);
  console.log('\nExecuting...\n');

  const executor = new AgentSDKExecutor();
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
  console.error('Error:', err);
  process.exit(1);
});
