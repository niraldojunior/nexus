#!/usr/bin/env node

/**
 * Quick test script for Research API endpoints
 * Usage: node scripts/test-research-api.mjs
 * 
 * Make sure to:
 * 1. Set OPENAI_API_KEY environment variable
 * 2. Start dev server: npm run dev
 * 3. Run this script: node scripts/test-research-api.mjs
 */

const BASE_URL = 'http://localhost:3001';
const DEBUG = true;

function log(...args) {
  console.log('[TEST]', ...args);
}

function debug(...args) {
  if (DEBUG) console.log('[DEBUG]', ...args);
}

async function request(method, path, body = null) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  debug(`${method} ${url}`, body ? JSON.stringify(body, null, 2) : '');

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    debug('Response:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error(`❌ Request failed: ${error.message}`);
    throw error;
  }
}

async function main() {
  try {
    log('🚀 Starting Research API Tests');
    log('');

    // Test 1: Create a new session
    log('📝 Test 1: Create new session');
    const session = await request('POST', '/v1/research/sessions', {
      title: 'Test Chat Session',
      context: 'You are a helpful assistant for Nexus inventory platform.',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 2000,
    });

    if (!session.id) {
      throw new Error('Session creation failed: no ID returned');
    }

    const sessionId = session.id;
    log(`✅ Created session: ${sessionId}`);
    log(`   Title: ${session.title}`);
    log(`   Status: ${session.status}`);
    log('');

    // Test 2: Get all sessions
    log('📚 Test 2: List all sessions');
    const sessions = await request('GET', '/v1/research/sessions');
    log(`✅ Found ${sessions.length} session(s)`);
    log('');

    // Test 3: Get specific session
    log('🔍 Test 3: Get session details');
    const sessionDetail = await request('GET', `/v1/research/sessions/${sessionId}`);
    log(`✅ Session: ${sessionDetail.title}`);
    log(`   Messages: ${(sessionDetail.messages || []).length}`);
    log('');

    // Test 4: Send a message
    log('💬 Test 4: Send message and get ChatGPT response');
    log('   (This may take 10-30 seconds due to OpenAI API latency)');

    const messageResponse = await request('POST', `/v1/research/sessions/${sessionId}/messages`, {
      message: 'What is a Geographic Site in the Nexus platform?',
    });

    log('✅ Message sent and response received');
    log(`   User message: "${messageResponse.userMessage.content.substring(0, 50)}..."`);
    log(`   Assistant reply: "${messageResponse.assistantMessage.content.substring(0, 80)}..."`);
    log(`   Tokens used: ${messageResponse.assistantMessage.tokensUsed || 'N/A'}`);
    log('');

    // Test 5: Get updated session with messages
    log('📋 Test 5: Get session with full message history');
    const updatedSession = await request('GET', `/v1/research/sessions/${sessionId}`);
    log(`✅ Session now has ${updatedSession.messages.length} messages`);
    updatedSession.messages.forEach((msg, i) => {
      log(`   [${i}] ${msg.role.toUpperCase()}: "${msg.content.substring(0, 60)}..."`);
    });
    log('');

    // Test 6: Update session title
    log('✏️  Test 6: Update session title');
    const updated = await request('PUT', `/v1/research/sessions/${sessionId}`, {
      title: 'Understanding Geographic Concepts in Nexus',
    });
    log(`✅ Title updated to: "${updated.title}"`);
    log('');

    // Test 7: Archive session
    log('🗑️  Test 7: Archive session');
    const archived = await request('DELETE', `/v1/research/sessions/${sessionId}`);
    log(`✅ Session archived with status: ${archived.status}`);
    log('');

    log('✨ All tests completed successfully!');
    log('');
    log('📌 Next steps:');
    log('   1. Open http://localhost:5173 in browser');
    log('   2. Click "Nova Pesquisa" in left sidebar');
    log('   3. Type a message and press Enter');
    log('   4. Watch ChatGPT responses appear in real-time');
    log('');

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

main();
