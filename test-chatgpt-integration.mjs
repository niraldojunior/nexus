#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';

// Load .env
loadEnv();

// Test ChatGPT integration
const apiKey = process.env.OPENAI_API_KEY;
const authToken = process.env.AUTH_TOKEN;

console.log('\n=== ChatGPT Integration Test ===\n');

if (!apiKey) {
  console.log('❌ OPENAI_API_KEY not found\n');
  process.exit(1);
}

if (!authToken) {
  console.log('❌ AUTH_TOKEN not found\n');
  process.exit(1);
}

console.log('✅ OPENAI_API_KEY loaded:', apiKey.substring(0, 20) + '...');
console.log('✅ AUTH_TOKEN loaded:', authToken);

// Test creating a session first
console.log('\n1. Creating a test research session...');

const createSessionResponse = await fetch('http://localhost:4001/v1/research/sessions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
  },
  body: JSON.stringify({
    title: 'Test ChatGPT Session',
    model: 'gpt-4',
  }),
});

if (!createSessionResponse.ok) {
  console.log('❌ Failed to create session:', createSessionResponse.status);
  console.log('   Response:', await createSessionResponse.text());
  process.exit(1);
}

const session = await createSessionResponse.json();
console.log('✅ Session created:', session.id);
console.log('   Title:', session.title);

// Test sending a message
console.log('\n2. Sending a test message to ChatGPT...');

const messageResponse = await fetch(`http://localhost:4001/v1/research/sessions/${session.id}/messages`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
  },
  body: JSON.stringify({
    message: 'Say hello and confirm you are working.',
  }),
});

if (!messageResponse.ok) {
  const errorText = await messageResponse.text();
  console.log('❌ Failed to send message:', messageResponse.status);
  console.log('   Response:', errorText);
  
  if (messageResponse.status === 503) {
    console.log('   Error: ChatGPT not configured');
  }
  process.exit(1);
}

const response = await messageResponse.json();
console.log('✅ Message sent successfully!');
console.log('   User message:', response.userMessage);
console.log('   Assistant response:', response.assistantMessage);

console.log('\n✅ ChatGPT integration working correctly!\n');
