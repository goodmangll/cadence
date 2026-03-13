import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

const configPath = path.join(__dirname, '..', 'local', 'config', 'test-simple.yaml');
console.log('Reading:', configPath);

const content = fs.readFileSync(configPath, 'utf-8');
console.log('Content:\n', content);

try {
  const data = yaml.load(content) as any;
  console.log('Parsed:', JSON.stringify(data, null, 2));
  console.log('Has tasks:', !!data.tasks);
  if (data.tasks) {
    console.log('Tasks count:', data.tasks.length);
  }
} catch (e) {
  console.error('Parse error:', e);
}
