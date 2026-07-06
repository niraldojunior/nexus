#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { ChatGPTProvider } from './dist/src/modules/search/chatgpt-provider.js';

loadEnv();

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.log('❌ OPENAI_API_KEY not found');
  process.exit(1);
}

console.log('=== Direct ChatGPT Provider Test ===\n');
console.log('OPENAI_API_KEY:', apiKey.substring(0, 20) + '...\n');

try {
  const provider = new ChatGPTProvider(apiKey);
  console.log('✅ ChatGPTProvider initialized\n');

  console.log('Testing ChatGPT API call...\n');
  
  const response = await provider.call(
    'You are a helpful assistant testing the API connection.',
    [],
    'Say "Hello from ChatGPT" if you can see this message.',
    'gpt-3.5-turbo',
    0.7,
    200
  );

  console.log('✅ ChatGPT responded successfully!');
  console.log('Response:', response.content);
  console.log('Tokens used:', response.tokensUsed);
  console.log('Model:', response.metadata.model);

} catch (error) {
  console.log('❌ Error:', error instanceof Error ? error.message : String(error));
  console.log('\nFull error:');
  console.log(error);
  process.exit(1);
}
