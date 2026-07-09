import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LLMConversationMessage, LLMRequest, LLMResponse, ResearchMessage } from './domain.js';

type KnowledgeDocument = {
  title: string;
  path: string;
  content: string;
  tokens: string[];
};

type CuratedAnswer = {
  allOf: string[];
  content: string;
};

const KNOWLEDGE_FILES = [
  { title: 'Visao geral do produto', path: 'docs/00-visao-geral/product-overview.md' },
  { title: 'Regras de negocio', path: 'docs/00-visao-geral/business-rules.md' },
  { title: 'Glossario', path: 'docs/00-visao-geral/glossary.md' },
  { title: 'Nexus Copilot', path: 'docs/00-visao-geral/nexus-copilot-training.md' },
  { title: 'Modulo Geographic', path: 'docs/01-functional-specs/01-modulo-geo.md' },
  { title: 'Modulo Resource', path: 'docs/01-functional-specs/02-modulo-resource.md' },
  { title: 'Modulo Service', path: 'docs/01-functional-specs/03-modulo-service.md' },
] as const;

const STOP_WORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'e', 'ou', 'em', 'no', 'na',
  'nos', 'nas', 'para', 'por', 'com', 'sem', 'que', 'como', 'qual', 'quais', 'sobre', 'entre', 'ser',
  'esta', 'este', 'esse', 'essa', 'isso', 'isto', 'mais', 'menos', 'muito', 'muita', 'muitas', 'muitos',
  'ao', 'aos', 'se', 'sua', 'seu', 'suas', 'seus', 'uma', 'uns', 'umas', 'the', 'and', 'or',
]);

let cachedDocuments: KnowledgeDocument[] | null = null;

const CURATED_ANSWERS: CuratedAnswer[] = [
  {
    allOf: ['triade'],
    content: [
      'A triade do Nexus separa o inventario em tres camadas canonicas.',
      '- Onde? Modulo 1, Geographic. Trata Site, Sub-Site, Address e Location.',
      '- O que? Modulo 2, Resource. Trata PhysicalResource e LogicalResource.',
      '- Para que / quem? Modulo 3, Service. Trata CFS, RFS e SubscriberID.',
      'Regra de fronteira: Service referencia Resource por `supportingResource`; Resource referencia Geographic por `place`.',
      'Fontes locais: docs/00-visao-geral/product-overview.md, docs/00-visao-geral/business-rules.md',
    ].join('\n'),
  },
  {
    allOf: ['geographic', 'site'],
    content: [
      'No Nexus, Geographic Site pertence ao modulo Geographic e responde a pergunta "onde?".',
      '- Ele representa locais como central, sala, andar, edificio, loja, condominio ou outros recortes espaciais.',
      '- Site nao contem recursos. Os recursos apenas referenciam o Site via `place`.',
      '- A fronteira canonica e o Rack: acima do Rack continua em Geographic; do Rack para dentro vira Resource.',
      'Fontes locais: docs/01-functional-specs/01-modulo-geo.md, docs/00-visao-geral/business-rules.md',
    ].join('\n'),
  },
  {
    allOf: ['modelo', 'ont'],
    content: [
      'Quando o usuario fala em "modelo de ONT", o Nexus deve tratar isso como cadastro de catalogo de equipamento, nao como instancia fisica.',
      '- O nome informado vira o nome do modelo no catalogo.',
      '- O fabricante deve ser resolvido automaticamente quando ja existir no inventario; nao faz sentido pedir ID para usuario leigo.',
      '- Para ONT e CPE, a categoria canonica e Equipamentos de Cliente (`Equipment.CustomerPremises`) e o tipo e `ONT`.',
      'Fontes locais: docs/00-visao-geral/nexus-copilot-training.md, docs/01-functional-specs/02-modulo-resource.md',
    ].join('\n'),
  },
  {
    allOf: ['remova', 'modelo'],
    content: [
      'Quando o usuario pede para remover, excluir ou desativar um modelo de equipamento, o Nexus deve tratar isso como soft-delete de ResourceSpecification no modulo Resource.',
      '- O catalogo nao faz exclusao fisica.',
      '- A resposta precisa ser explicita: se o modelo nao existir, ou houver ambiguidade, diga qual foi a causa.',
      '- Para ONT, CPE, OLT, Router e Switch, a referencia continua sendo o modelo de catalogo; a instancia fisica e outro objeto.',
      'Fontes locais: docs/00-visao-geral/nexus-copilot-training.md, docs/00-visao-geral/business-rules.md, docs/01-functional-specs/02-modulo-resource.md',
    ].join('\n'),
  },
  {
    allOf: ['modelos', 'abaixo'],
    content: [
      'Quando o usuario envia varios modelos em lote, o Nexus deve consolidar a operacao como cadastro em lote e nao parar no primeiro item.',
      '- A confirmacao precisa listar todos os itens do lote antes do commit.',
      '- O retorno final deve refletir o total de modelos processados.',
      'Fontes locais: docs/00-visao-geral/nexus-copilot-training.md, docs/01-functional-specs/02-modulo-resource.md',
    ].join('\n'),
  },
  {
    allOf: ['resource'],
    content: [
      'Resource e a camada que responde "o que existe" na rede.',
      '- Ela cobre PhysicalResource e LogicalResource.',
      '- Resource nao contem Geographic. Ele referencia localizacao por `place`.',
      '- Quando um servico depende de infraestrutura, a amarracao correta e `supportingResource` no modulo Service.',
      'Fontes locais: docs/01-functional-specs/02-modulo-resource.md, docs/00-visao-geral/business-rules.md',
    ].join('\n'),
  },
  {
    allOf: ['service'],
    content: [
      'Service e a camada que responde "para que / para quem" no Nexus.',
      '- CFS representa a visao comercial, normalmente associada ao Tenant/ISP.',
      '- RFS representa a visao tecnica e consome recursos.',
      '- CFS nao referencia Resource diretamente; o encadeamento correto passa pelo RFS.',
      'Fontes locais: docs/01-functional-specs/03-modulo-service.md, docs/00-visao-geral/business-rules.md',
    ].join('\n'),
  },
  {
    allOf: ['home', 'passed'],
    content: [
      'Home Passed nao e Service no Nexus.',
      '- HP fica em GeographicAddress no modulo Geographic.',
      '- A elegibilidade e tratada por Service Qualification no modulo Order.',
      '- So Home Connected vira ServiceInstance no modulo Service.',
      'Fontes locais: docs/00-visao-geral/business-rules.md, docs/00-visao-geral/product-overview.md',
    ].join('\n'),
  },
  {
    allOf: ['cfs', 'rfs'],
    content: [
      'CFS e RFS tem papeis diferentes e nao devem ser misturados.',
      '- CFS e a camada comercial, ligada ao subscriber, tipicamente um Tenant ISP no modelo wholesale.',
      '- RFS e a camada tecnica, que consome recursos e suporta o CFS.',
      '- CFS nunca referencia Resource diretamente.',
      'Fontes locais: docs/01-functional-specs/03-modulo-service.md, docs/00-visao-geral/business-rules.md',
    ].join('\n'),
  },
  {
    allOf: ['tenant'],
    content: [
      'Nexus e multi-tenant e wholesale por desenho.',
      '- O Tenant entra desde a criacao em `relatedParty`.',
      '- No modulo Service, o subscriber do CFS e tipicamente um ISP/Tenant, nao o usuario final.',
      'Fontes locais: docs/00-visao-geral/business-rules.md, docs/00-visao-geral/product-overview.md',
    ].join('\n'),
  },
  {
    allOf: ['copilot'],
    content: [
      'Nexus Copilot e o agente conversacional especializado do V.tal Nexus.',
      '- Ele responde apenas sobre V.tal, Telecom, inventario, redes, TMF e operacao wholesale.',
      '- Seu contexto padrao vem de docs/00-visao-geral/nexus-copilot-training.md.',
      '- Quando a pergunta sair do escopo, o comportamento correto e recusar e redirecionar.',
      'Fontes locais: docs/00-visao-geral/nexus-copilot-training.md',
    ].join('\n'),
  },
  {
    allOf: ['rack'],
    content: [
      'Rack e a fronteira canonica entre Geographic e Resource.',
      '- Acima do Rack: sala, andar, central e outros recortes continuam em GeographicSite.',
      '- Do Rack para dentro: rack, chassis, placas, portas e demais itens entram como PhysicalResource.',
      'Fontes locais: docs/00-visao-geral/business-rules.md, docs/01-functional-specs/02-modulo-resource.md',
    ].join('\n'),
  },
];

const CAPABILITY_RESPONSE = [
  'Sem o provedor externo disponivel, o Nexus Copilot fica em modo de fallback local.',
  '- Nesse modo, eu consigo responder com base na documentacao do Nexus sobre TMF, Geographic, Resource, Service, Order, Tenant, CFS e RFS.',
  '- Eu nao consigo consultar dados reais do inventario nem executar ferramentas MCP enquanto o provedor externo estiver indisponivel.',
  '- Quando o provedor estiver ativo, o Copilot pode consultar e preparar operacoes sobre Geo, Resource, Service, Party, Order e Event.',
].join('\n');

const INVENTORY_UNAVAILABLE_RESPONSE = [
  'Nao consegui consultar o provedor externo, entao o Copilot nao pode usar MCP nesta conversa.',
  'Sem MCP ativo, eu nao consigo consultar dados reais do inventario, cadastrar entidades, abrir ordens ou ativar recursos agora.',
  'Posso explicar a modelagem e os fluxos TMF com base na documentacao local, ou voce pode reativar o provedor externo para operacao em tempo real.',
].join('\n\n');

const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const tokenize = (value: string): string[] =>
  normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

const isCopilotCapabilityQuestion = (value: string): boolean => {
  const normalized = normalizeText(value);
  return (
    normalized.includes('o que voce pode fazer') ||
    normalized.includes('o que vc pode fazer') ||
    normalized.includes('quais capacidades') ||
    normalized.includes('quais ferramentas') ||
    normalized.includes('como voce pode ajudar') ||
    normalized.includes('o que o copilot faz') ||
    normalized.includes('o que o nexus copilot faz')
  );
};

const isInventoryOperationIntent = (tokens: string[]): boolean => {
  const tokenSet = new Set(tokens);
  const intentTokens = [
    'listar',
    'consultar',
    'buscar',
    'mostrar',
    'inventario',
    'site',
    'sites',
    'resource',
    'resources',
    'service',
    'services',
    'party',
    'event',
    'order',
    'ordem',
    'cadastre',
    'criar',
    'lote',
    'varios',
    'vários',
    'ativar',
    'remover',
    'excluir',
    'desativar',
    'retirar',
    'qualificacao',
    'viabilidade',
    'mcp',
  ];

  return intentTokens.some((token) => tokenSet.has(token));
};

const getCuratedAnswer = (tokens: string[]): string | null => {
  const tokenSet = new Set(tokens);
  const match = CURATED_ANSWERS.find((entry) => entry.allOf.every((token) => tokenSet.has(token)));
  return match?.content ?? null;
};

const loadDocuments = (): KnowledgeDocument[] => {
  if (cachedDocuments) {
    return cachedDocuments;
  }

  cachedDocuments = KNOWLEDGE_FILES.flatMap((entry) => {
    const filePath = resolve(process.cwd(), entry.path);
    if (!existsSync(filePath)) {
      return [];
    }

    const content = readFileSync(filePath, 'utf8');
    return [{
      title: entry.title,
      path: entry.path,
      content,
      tokens: tokenize(`${entry.title} ${content}`),
    }];
  });

  return cachedDocuments;
};

const scoreText = (tokens: string[], content: string): number => {
  if (tokens.length === 0) {
    return 0;
  }

  const normalized = normalizeText(content);
  return tokens.reduce((score, token) => score + (normalized.includes(token) ? 1 : 0), 0);
};

const pickRelevantSnippets = (document: KnowledgeDocument, tokens: string[]): string[] => {
  const lines = document.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 30 && !line.startsWith('|') && !line.startsWith('```'));

  return lines
    .map((line) => ({ line, score: scoreText(tokens, line) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.line.length - right.line.length)
    .slice(0, 2)
    .map((entry) => entry.line);
};

const buildOfflineAnswer = (userMessage: string): string => {
  if (isCopilotCapabilityQuestion(userMessage)) {
    return CAPABILITY_RESPONSE;
  }

  const queryTokens = tokenize(userMessage);
  const curatedAnswer = getCuratedAnswer(queryTokens);
  if (curatedAnswer) {
    return [
      'Nao consegui consultar o provedor externo. Respondi com base na documentacao local do Nexus.',
      curatedAnswer,
    ].join('\n\n');
  }

  if (isInventoryOperationIntent(queryTokens)) {
    return INVENTORY_UNAVAILABLE_RESPONSE;
  }

  const documents = loadDocuments();

  const ranked = documents
    .map((document) => ({
      document,
      score: scoreText(queryTokens, `${document.title} ${document.content}`),
      snippets: pickRelevantSnippets(document, queryTokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (ranked.length === 0 || queryTokens.length < 2 || (ranked[0]?.score ?? 0) < 2) {
    return [
      'Nao consegui usar o provedor externo e nao encontrei uma resposta confiavel na documentacao local para esta pergunta.',
      'Tente reformular com termos do dominio Nexus, como Geographic, Resource, Service, Tenant, Home Passed, CFS ou RFS.',
    ].join('\n\n');
  }

  const topEntries = ranked.slice(0, 3);
  const summaryLines = topEntries.flatMap((entry) =>
    entry.snippets.slice(0, 1).map((snippet) => `- ${snippet.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '')}`),
  );
  const sourceLine = `Fontes locais: ${topEntries.map((entry) => entry.document.path).join(', ')}`;

  return [
    'Nao consegui consultar o provedor externo. Respondi com base na documentacao local do Nexus.',
    summaryLines.join('\n'),
    sourceLine,
  ].join('\n\n');
};

export class LocalKnowledgeProvider {
  async complete(
    messages: LLMConversationMessage[],
    model = 'nexus-local-docs',
  ): Promise<LLMResponse> {
    const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    return {
      content: buildOfflineAnswer(latestUserMessage),
      metadata: {
        model,
        fallback: true,
        source: 'local-docs',
      },
    };
  }

  async call(
    context: string,
    messages: ResearchMessage[],
    userMessage: string,
    model = 'nexus-local-docs',
  ): Promise<LLMResponse> {
    const openaiMessages: LLMConversationMessage[] = [
      ...(context ? [{ role: 'system' as const, content: context }] : []),
      ...messages.map((message) => ({
        role: message.role as 'system' | 'user' | 'assistant',
        content: message.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    return this.complete(openaiMessages, model);
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    return this.complete(request.transcript, request.model || 'nexus-local-docs');
  }
}
