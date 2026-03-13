import { FileTaskConfigLoader } from '../src/core/task-manager/file-task-config';
import * as path from 'path';

const configPath = path.join(__dirname, '..', 'local', 'config', 'test-simple.yaml');
console.log('Testing loader with:', configPath);

const loader = new FileTaskConfigLoader(configPath);
try {
  const configs = loader.load();
  console.log('Success! Loaded:', configs.length, 'configs');
  console.log('Configs:', configs);
} catch (e) {
  console.error('Error:', e);
  console.error('Stack:', (e as Error).stack);
}
