import { FileTaskConfigLoader } from '../src/core/task-manager/file-task-config';
import { AgentSDKExecutor } from '../src/core/executor/agent-sdk-executor';
import * as path from 'path';

async function main() {
  console.log('=== Cadence YAML Test (Fixed) ===\n');

  // 1. 加载 YAML 配置
  const configPath = path.join(__dirname, '..', 'local', 'config', 'test-simple.yaml');
  console.log('Loading config from:', configPath);

  const loader = new FileTaskConfigLoader(configPath);
  const configs = loader.load();

  if (configs.length === 0) {
    console.error('No tasks found in config');
    process.exit(1);
  }

  const fileConfig = configs[0];
  console.log(`\n✅ Loaded task:`);
  console.log(`  Name: ${fileConfig.name}`);
  console.log(`  ID: ${fileConfig.id}`);
  console.log(`  Command: ${fileConfig.execution.command}`);
  console.log(`  Working Dir: ${fileConfig.execution.workingDir}`);

  // 2. 转换为 Task 格式 - 不修改 command！
  const task = {
    id: fileConfig.id,
    name: fileConfig.name,
    description: fileConfig.description,
    enabled: fileConfig.enabled,
    trigger: fileConfig.trigger,
    execution: {
      command: fileConfig.execution.command, // 使用 YAML 中的原生命令
      workingDir: fileConfig.execution.workingDir,
      timeout: 300,
      settingSources: fileConfig.execution.settingSources,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 3. 执行任务
  console.log('\n🚀 Executing task with command:', task.execution.command);
  console.log('Working directory:', task.execution.workingDir);
  console.log('\n---\n');

  const executor = new AgentSDKExecutor({ defaultTimeout: 300 });
  const result = await executor.execute(task as any);

  // 4. 输出结果
  console.log('\n---\n');
  console.log('=== Execution Result ===');
  console.log('Status:', result.status);
  console.log('Duration:', result.duration, 'ms');
  if (result.output) {
    console.log('\nOutput:\n');
    console.log(result.output);
  }
  if (result.error) {
    console.log('\nError:\n');
    console.log(result.error);
  }

  console.log('\n✅ YAML test completed!');
}

main().catch(err => {
  console.error('\n❌ Error:', err);
  process.exit(1);
});
