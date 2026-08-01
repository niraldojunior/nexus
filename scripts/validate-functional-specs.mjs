import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = process.cwd();
const specsDir = join(root, 'docs', '2-functional-specs');
const backlogPath = join(root, 'docs', '5-delivery-plan', 'technical-backlog.md');
const questionsPath = join(root, 'docs', '1-overview', 'open-questions.md');
const decisionsPath = join(root, 'docs', '5-delivery-plan', 'architecture-decisions.md');
const overviewPath = join(root, 'docs', '1-overview', 'product-overview.md');
const specs = [
  {
    file: '01-module-geo.md',
    prefix: 'REQ-MOD01-',
    questionPrefix: 'Q-GEO-',
    decisionPrefix: 'D-GEO-',
    count: 13,
    version: '1.3',
    illustrative: new Set(),
  },
  {
    file: '02-module-resource.md',
    prefix: 'REQ-MOD02-',
    questionPrefix: 'Q-RES-',
    decisionPrefix: 'D-RES-',
    count: 28,
    version: '1.4',
    illustrative: new Set(),
  },
  {
    file: '03-module-service.md',
    prefix: 'REQ-MOD03-',
    questionPrefix: 'Q-SVC-',
    decisionPrefix: 'D-SVC-',
    count: 16,
    version: '1.2',
    illustrative: new Set(['REQ-MOD03-012', 'REQ-MOD03-013', 'REQ-MOD03-014']),
  },
];

const errors = [];
const fail = (message) => errors.push(message);
const normalizeVersion = (value) => value.replace(/\s+—\s+draft\s*$/u, '').trim();

for (const definition of specs) {
  const path = join(specsDir, definition.file);
  const text = readFileSync(path, 'utf8');
  const requirementMatches = [...text.matchAll(/^## (\d+)\. (REQ-MOD\d{2}-\d{3}) —/gmu)];
  const ids = requirementMatches.map((match) => match[2]);
  const expectedIds = Array.from({ length: definition.count }, (_, index) =>
    `${definition.prefix}${String(index + 1).padStart(3, '0')}`,
  );

  if (ids.join('|') !== expectedIds.join('|')) {
    fail(`${definition.file}: sequência de requisitos diferente de ${expectedIds[0]}…${expectedIds.at(-1)}`);
  }

  const summary = text.match(/## 5\. Resumo dos requisitos do módulo([\s\S]*?)(?=\n## 6\.)/u)?.[1];
  if (!summary) fail(`${definition.file}: resumo de requisitos ausente`);
  else {
    for (const id of expectedIds) {
      if (!summary.includes(`**${id}**`)) fail(`${definition.file}: ${id} ausente no resumo de requisitos`);
    }
  }

  const adherenceMatch = text.match(/### 2\.3 Aderência ao codebase atual([\s\S]*?)(?=\n---\n|\n## 3\.)/u);
  if (!adherenceMatch) {
    fail(`${definition.file}: seção 2.3 de aderência ausente`);
  } else {
    const adherence = adherenceMatch[1];
    for (const id of expectedIds) {
      const row = adherence
        .split(/\r?\n/u)
        .find((line) => line.includes(`**${id}**`));
      if (!row) fail(`${definition.file}: ${id} ausente na matriz de aderência`);
      else {
        if (!/\b(Implementado|Parcial|Não implementado|Divergente)\b/u.test(row)) {
          fail(`${definition.file}: ${id} sem estado de implementação válido`);
        }
        if (!/DEV-(?:GEO|RES|SVC|X)-\d{3}/u.test(row)) {
          fail(`${definition.file}: ${id} sem item DEV-* rastreável`);
        }
        if (/\| Implementado \|/u.test(row) && !/(?:test|spec)/iu.test(row)) {
          fail(`${definition.file}: ${id} marcado Implementado sem evidência explícita de teste`);
        }
      }
    }
  }

  for (let index = 0; index < requirementMatches.length; index += 1) {
    const current = requirementMatches[index];
    const next = requirementMatches[index + 1];
    const block = text.slice(current.index, next?.index ?? text.length);
    const section = current[1];
    const id = current[2];
    const subsections = [...block.matchAll(new RegExp(`^### ${section}\\.(\\d+) `, 'gmu'))].map((match) =>
      Number(match[1]),
    );
    const expected = definition.illustrative.has(id) ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
    if (subsections.join('|') !== expected.join('|')) {
      fail(`${definition.file}: ${id} possui subitens ${subsections.join(',')}; esperado ${expected.join(',')}`);
    }

    if (!/Status funcional:\*{0,2}\s*(?:Especificado|Bloqueado por Q-(?:GEO|RES|SVC|ARQ|INT)-\d{3})/u.test(block)) {
      fail(`${definition.file}: ${id} sem maturidade funcional Especificado/Bloqueado por Q-*`);
    }

    const benchmarkHeading = definition.illustrative.has(id) ? expected.at(-1) : 9;
    const benchmark = block.match(
      new RegExp(`### ${section}\\.${benchmarkHeading} Mapeamento contra sistemas de referência([\\s\\S]*?)(?=\\n---\\n|$)`, 'u'),
    );
    if (!benchmark || !benchmark[1].includes('| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |')) {
      fail(`${definition.file}: ${id} sem tabela N.${benchmarkHeading} completa de benchmark`);
    } else {
      const rows = benchmark[1]
        .split(/\r?\n/u)
        .filter((line) => /^\| \*\*.+\|/u.test(line));
      if (rows.length === 0) fail(`${definition.file}: ${id} sem capacidade comparada no benchmark`);
      for (const row of rows) {
        const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
        for (const systemCell of cells.slice(1, 4)) {
          if (/^(?:N\/A|Inexistente|\*\*Inexistente|Não(?! identificado no levantamento))/u.test(systemCell)) {
            fail(`${definition.file}: ${id} usa negativa categórica sem evidência no benchmark (${systemCell})`);
          }
        }
      }
    }
  }

  for (const [index, match] of [...text.matchAll(/```json\s*([\s\S]*?)\s*```/gu)].entries()) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      fail(`${definition.file}: bloco JSON ${index + 1} inválido (${error.message})`);
    }
  }

  const headerVersion = text.match(/\| \*\*Versão\*\* \| ([^|]+) \|/u)?.[1];
  const revisionVersions = [...text.matchAll(/^\| (\d+\.\d+) \| [^|]+ \| [^|]+ \|/gmu)].map((match) => match[1]);
  const latestRevision = revisionVersions.at(-1);
  if (!headerVersion || !latestRevision || normalizeVersion(headerVersion) !== latestRevision) {
    fail(`${definition.file}: versão do cabeçalho (${headerVersion?.trim() ?? 'ausente'}) difere da revisão (${latestRevision ?? 'ausente'})`);
  }
  if (normalizeVersion(headerVersion ?? '') !== definition.version) {
    fail(`${definition.file}: versão esperada ${definition.version}, encontrada ${headerVersion?.trim() ?? 'ausente'}`);
  }
  if (!/\| \*\*Status\*\* \| Em elaboração \|/u.test(text)) {
    fail(`${definition.file}: status do documento deve permanecer Em elaboração`);
  }
  if (/\bQ-\d{3}\b|\bD-\d+\b/u.test(text)) {
    fail(`${definition.file}: contém ID de questão/decisão sem namespace de domínio`);
  }
  for (const line of text.split(/\r?\n/u)) {
    if (/^\| \*\*Q-(?:GEO|RES|SVC)-\d{3}\*\*/u.test(line) && /Decidid/iu.test(line)) {
      fail(`${definition.file}: questão resolvida deve usar ID D-* (${line.split('|')[1]?.trim()})`);
    }
  }
}

const backlog = readFileSync(backlogPath, 'utf8');
const referencedBacklogIds = new Set();
for (const definition of specs) {
  const text = readFileSync(join(specsDir, definition.file), 'utf8');
  for (const match of text.matchAll(/DEV-(?:GEO|RES|SVC|X)-\d{3}/gu)) referencedBacklogIds.add(match[0]);
}
for (const id of referencedBacklogIds) {
  if (!backlog.includes(`| ${id} |`) && !backlog.includes(`| **${id}** |`)) fail(`technical-backlog.md: item ${id} referenciado mas não definido`);
}

const definedBacklogIds = new Set();
for (const line of backlog.split(/\r?\n/u)) {
  if (!/^\| DEV-(?:GEO|RES|SVC|X)-\d{3} \|/u.test(line)) continue;
  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
  const [id, priority, status, origin, behavior, contract, dependency, evidence, acceptance] = cells;
  if (definedBacklogIds.has(id)) fail(`technical-backlog.md: item ${id} definido mais de uma vez`);
  definedBacklogIds.add(id);
  if (!/^P[0-2]$/u.test(priority)) fail(`technical-backlog.md: ${id} com prioridade inválida`);
  if (!/^(?:Concluído|Parcial|Pendente|Superado)$/u.test(status)) fail(`technical-backlog.md: ${id} com estado inválido`);
  if (!/(?:REQ-MOD\d{2}-\d{3}|C\d+)/u.test(origin)) fail(`technical-backlog.md: ${id} sem origem REQ/C rastreável`);
  for (const [field, value] of Object.entries({ behavior, contract, dependency, evidence, acceptance })) {
    if (!value || value === '—') fail(`technical-backlog.md: ${id} sem campo ${field}`);
  }
}
for (const id of definedBacklogIds) {
  if (!referencedBacklogIds.has(id)) fail(`technical-backlog.md: item ${id} não referenciado por nenhum HLD`);
}

const canonicalQuestions = readFileSync(questionsPath, 'utf8');
const canonicalDecisions = readFileSync(decisionsPath, 'utf8');
for (const definition of specs) {
  const text = readFileSync(join(specsDir, definition.file), 'utf8');
  for (const match of text.matchAll(/\bQ-(?:GEO|RES|SVC|ARQ|INT)-\d{3}\b/gu)) {
    if (!canonicalQuestions.includes(match[0])) fail(`${definition.file}: questão ${match[0]} ausente no registro central`);
  }
  for (const match of text.matchAll(/\bD-(?:GEO|RES|SVC)-\d{3}\b/gu)) {
    if (!canonicalDecisions.includes(match[0])) fail(`${definition.file}: decisão ${match[0]} ausente no registro central`);
  }

  const hldQuestionIds = new Set(
    [...text.matchAll(/^\| \*\*(Q-(?:GEO|RES|SVC)-\d{3})\*\* \|/gmu)].map((match) => match[1]),
  );
  const centralQuestionIds = new Set(
    [...canonicalQuestions.matchAll(/^\| (Q-(?:GEO|RES|SVC)-\d{3}) \|/gmu)]
      .map((match) => match[1])
      .filter((id) => id.startsWith(definition.questionPrefix)),
  );
  if ([...hldQuestionIds].sort().join('|') !== [...centralQuestionIds].sort().join('|')) {
    fail(`${definition.file}: conjunto de questões abertas difere do registro central`);
  }

  const hldDecisionIds = new Set(
    [...text.matchAll(/\bD-(?:GEO|RES|SVC)-\d{3}\b/gu)]
      .map((match) => match[0])
      .filter((id) => id.startsWith(definition.decisionPrefix)),
  );
  const centralDecisionIds = new Set(
    [...canonicalDecisions.matchAll(/^\| (D-(?:GEO|RES|SVC)-\d{3}) \|/gmu)]
      .map((match) => match[1])
      .filter((id) => id.startsWith(definition.decisionPrefix)),
  );
  if ([...hldDecisionIds].sort().join('|') !== [...centralDecisionIds].sort().join('|')) {
    fail(`${definition.file}: conjunto de decisões resolvidas difere do registro central`);
  }
}

const benchmarkPlaybook = readFileSync(join(specsDir, '_benchmark-systems.md'), 'utf8');
for (const source of ['netwin.md', 'kuwaiba.md', 'netbox.md']) {
  const sourcePath = join(specsDir, 'inspirations', source);
  if (!existsSync(sourcePath)) fail(`fonte de benchmark ausente: inspirations/${source}`);
  if (!benchmarkPlaybook.includes(`inspirations/${source}`)) fail(`_benchmark-systems.md: fonte inspirations/${source} não referenciada`);
}

const overview = readFileSync(overviewPath, 'utf8');
if (!overview.includes('Base implementada; aderência parcial ao HLD')) {
  fail('product-overview.md: não distingue implementação-base de aderência completa ao HLD');
}

const markdownFiles = [];
const collectMarkdown = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectMarkdown(path);
    else if (entry.isFile() && entry.name.endsWith('.md')) markdownFiles.push(path);
  }
};
collectMarkdown(join(root, 'docs'));
markdownFiles.push(join(root, 'AGENTS.md'));

for (const path of markdownFiles) {
  const text = readFileSync(path, 'utf8');
  if (text.includes('reference-systems/')) fail(`${relative(root, path)}: referência obsoleta a reference-systems/`);
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
    const target = match[1].trim().replace(/^<|>$/gu, '');
    if (/^(?:https?:\/\/|mailto:|#)/u.test(target)) continue;
    const filePart = decodeURIComponent(target.split('#', 1)[0]);
    if (!filePart) continue;
    const candidate = resolve(dirname(path), filePart);
    if (!existsSync(candidate)) fail(`${relative(root, path)}: link local inexistente ${target}`);
  }
}

if (errors.length > 0) {
  console.error(`Functional specs inválidas (${errors.length} problema(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Functional specs válidas: 57 requisitos, matrizes, JSON, links, benchmarks e backlog conferidos.');
}
