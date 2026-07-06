#!/usr/bin/env node

import { ChatGPTProvider } from './dist/src/modules/search/chatgpt-provider.js';

// Load OPENAI_API_KEY from environment
const apiKey = process.env.OPENAI_API_KEY;

console.log('\n=== OpenAI Configuration Validation ===\n');

if (!apiKey) {
  console.log('❌ OPENAI_API_KEY não encontrada');
  process.exit(1);
}

console.log('✅ OPENAI_API_KEY encontrada');
console.log(`   Prefixo: ${apiKey.substring(0, 20)}...`);
console.log(`   Comprimento: ${apiKey.length} caracteres`);
console.log(`   Formato válido (sk-proj-): ${apiKey.startsWith('sk-proj-') ? 'Sim' : 'Não'}`);

try {
  const provider = new ChatGPTProvider(apiKey);
  console.log('\n✅ ChatGPTProvider inicializado com sucesso!');
  console.log('✅ Sistema pronto para usar OpenAI API\n');
  process.exit(0);
} catch (error) {
  console.log('\n❌ Erro ao inicializar ChatGPTProvider:');
  console.log(`   ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
