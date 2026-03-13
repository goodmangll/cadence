import { FileTaskConfigLoader } from '../src/core/task-manager/file-task-config';
import { AgentSDKExecutor } from '../src/core/executor/agent-sdk-executor';
import * as path from 'path';

async function main() {
  console.log('=== Cadence Test Task Runner ===\n');

  // 1. 加载配置
  const configPath = path.join(__dirname, '..', 'local', 'config', 'test-simple.yaml');
  console.log(`Loading config from: ${configPath}`);

  const loader = new FileTaskConfigLoader(configPath);
  const configs = loader.load();

  if (configs.length === 0) {
    console.error('No tasks found in config');
    process.exit(1);
  }

  console.log(`Loaded ${configs.length} task(s):`);
  configs.forEach(cfg => console.log(`  - ${cfg.name} (${cfg.id})`));
  console.log();

  // 2. 转换为 Task 格式（简单转换）
  const task = {
    id: configs[0].id,
    name: configs[0].name,
    description: configs[0].description,
    enabled: configs[0].enabled,
    trigger: configs[0].trigger,
    execution: {
      command: configs[0].execution.command,
      workingDir: configs[0].execution.workingDir,
      timeout: configs[0].execution.timeout,
      settingSources: configs[0].execution.settingSources,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 3. 执行任务
  console.log('Executing task...\n');
  const executor = new AgentSDKExecutor();
  const result = await executor.execute(task as any);

  // 4. 输出结果
  console.log('\n=== Execution Result ===');
  console.log(`Status: ${result.status}`);
  console.log(`Duration: ${result.duration}ms`);
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
