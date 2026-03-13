import { FileTaskConfigLoader } from '../src/core/task-manager/file-task-config';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

const configPath = path.join(__dirname, '..', 'local', 'config', 'test-simple.yaml');
console.log('Testing loader with:', configPath);

// First, try to load and parse manually
console.log('\n--- Manual parse ---');
const content = fs.readFileSync(configPath, 'utf-8');
console.log('Content loaded, length:', content.length);

const data = yaml.load(content) as any;
console.log('Parsed:', JSON.stringify(data, null, 2));

console.log('\n--- Using FileTaskConfigLoader ---');
try {
  const loader = new FileTaskConfigLoader(configPath);

  // Access private methods for debugging
  const loaderAny = loader as any;

  console.log('Calling parseContent...');
  const result = loaderAny.parseContent(content);
  console.log('Success! Result:', result);
} catch (e) {
  console.error('Error:', e);
  console.error('Stack:', (e as Error).stack);
}
