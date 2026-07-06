#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';

loadEnv();

const apiKey = process.env.OPENAI_API_KEY;

console.log('\n=== OpenAI API Connectivity Test ===\n');
console.log('API Key:', apiKey ? apiKey.substring(0, 20) + '...' : 'NOT SET');

try {
  console.log('\nFetching models from OpenAI API...');
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  
  console.log('Status:', res.status);
  console.log('OK:', res.ok);
  
  const txt = await res.text();
  console.log('Response:', txt.substring(0, 200) + (txt.length > 200 ? '...' : ''));
  
  if (!res.ok) {
    try {
      const json = JSON.parse(txt);
      console.log('\nError details:');
      console.log(JSON.stringify(json, null, 2));
    } catch {
      // Not JSON
    }
  }
} catch (e) {
  console.log('\n❌ Network Error:', e.message);
  console.log('Code:', (e).code);
  console.log('\nPossible causes:');
  console.log('- Network connectivity issue');
  console.log('- Corporate proxy or firewall blocking OpenAI');
  console.log('- SSL/TLS certificate issue');
  console.log('- DNS resolution problem');
}
