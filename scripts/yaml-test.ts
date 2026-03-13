import { FileTaskConfigLoader } from '../src/core/task-manager/file-task-config';
import { AgentSDKExecutor } from '../src/core/executor/agent-sdk-executor';
import * as path from 'path';

async function main() {
  console.log('=== Cadence YAML Test ===\n');

  // 1. 加载 YAML 配置
  const configPath = path.join(__dirname, '..', 'local', 'config', 'test-simple.yaml');
  console.log('Loading config from:', configPath);

  const loader = new FileTaskConfigLoader(configPath);
  const configs = loader.load();

  if (configs.length === 0) {
    console.error('No tasks found in config');
    process.exit(1);
  }

  console.log(`\n✅ Loaded ${configs.length} task(s):`);
  configs.forEach(cfg => {
    console.log(`  - ${cfg.name} (${cfg.id})`);
    console.log(`    Command: ${cfg.execution.command}`);
  });

  // 2. 转换为 Task 格式
  const fileConfig = configs[0];
  const task = {
    id: fileConfig.id,
    name: fileConfig.name,
    description: fileConfig.description,
    enabled: fileConfig.enabled,
    trigger: fileConfig.trigger,
    execution: {
      command: fileConfig.execution.command,
      workingDir: fileConfig.execution.workingDir,
      timeout: fileConfig.execution.timeout || 300,
      settingSources: fileConfig.execution.settingSources,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 3. 执行任务
  console.log('\n🚀 Executing task...\n');
  const executor = new AgentSDKExecutor({ defaultTimeout: 300 });
  const result = await executor.execute(task as any);

  // 4. 输出结果
  console.log('\n=== Execution Result ===');
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

  console.log('\n✅ YAML test completed successfully!');
}

main().catch(err => {
  console.error('\n❌ Error:', err);
  process.exit(1);
});
