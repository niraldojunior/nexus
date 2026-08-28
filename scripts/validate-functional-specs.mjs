import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = process.cwd();
const specsDir = join(root, 'docs', '2-functional-specs');
const decisionsPath = join(root, 'docs', '5-delivery-plan', 'architecture-decisions.md');
const overviewPath = join(root, 'docs', '1-overview', 'product-overview.md');
const specs = [
  {
    file: '01-module-geo.md',
    prefix: 'REQ-MOD01-',
    decisionPrefix: 'D-GEO-',
    count: 18,
    version: '1.21',
    illustrative: new Set(),
  },
  {
    file: '02-module-resource.md',
    prefix: 'REQ-MOD02-',
    decisionPrefix: 'D-RES-',
    count: 28,
    version: '1.5',
    illustrative: new Set(),
  },
  {
    file: '03-module-service.md',
    prefix: 'REQ-MOD03-',
    decisionPrefix: 'D-SVC-',
    count: 16,
    version: '1.3',
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
  const expectedIds = Array.from(
    { length: definition.count },
    (_, index) => `${definition.prefix}${String(index + 1).padStart(3, '0')}`,
  );

  if (ids.join('|') !== expectedIds.join('|')) {
    fail(
      `${definition.file}: sequência de requisitos diferente de ${expectedIds[0]}…${expectedIds.at(-1)}`,
    );
  }

  const summary = text.match(/## 5\. Resumo dos requisitos do módulo([\s\S]*?)(?=\n## 6\.)/u)?.[1];
  if (!summary) fail(`${definition.file}: resumo de requisitos ausente`);
  else {
    for (const id of expectedIds) {
      if (!summary.includes(`**${id}**`))
        fail(`${definition.file}: ${id} ausente no resumo de requisitos`);
    }
  }

  const adherenceMatch = text.match(
    /### 2\.3 Aderência ao codebase atual([\s\S]*?)(?=\n---\n|\n## 3\.)/u,
  );
  if (!adherenceMatch) {
    fail(`${definition.file}: seção 2.3 de aderência ausente`);
  } else {
    const adherence = adherenceMatch[1];
    for (const id of expectedIds) {
      const row = adherence.split(/\r?\n/u).find((line) => line.includes(`**${id}**`));
      if (!row) fail(`${definition.file}: ${id} ausente na matriz de aderência`);
      else {
        if (!/\b(Implementado|Parcial|Não implementado|Divergente)\b/u.test(row)) {
          fail(`${definition.file}: ${id} sem estado de implementação válido`);
        }
        if (!/\[#\d+\]\(https:\/\/github\.com\/[^)]+\/issues\/\d+\)/u.test(row)) {
          fail(`${definition.file}: ${id} sem issue de backlog rastreável na coluna Backlog`);
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
    const subsections = [...block.matchAll(new RegExp(`^### ${section}\\.(\\d+) `, 'gmu'))].map(
      (match) => Number(match[1]),
    );
    const expected = definition.illustrative.has(id)
      ? [1, 2, 3, 4, 5, 6, 7]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9];
    if (subsections.join('|') !== expected.join('|')) {
      fail(
        `${definition.file}: ${id} possui subitens ${subsections.join(',')}; esperado ${expected.join(',')}`,
      );
    }

    if (!/Status funcional:\*{0,2}\s*(?:Especificado|Bloqueado por #\d+)/u.test(block)) {
      fail(
        `${definition.file}: ${id} sem maturidade funcional Especificado/Bloqueado por #<issue>`,
      );
    }

    const benchmarkHeading = definition.illustrative.has(id) ? expected.at(-1) : 9;
    const benchmark = block.match(
      new RegExp(
        `### ${section}\\.${benchmarkHeading} Mapeamento contra sistemas de referência([\\s\\S]*?)(?=\\n---\\n|$)`,
        'u',
      ),
    );
    if (
      !benchmark ||
      // Espaços em torno de cada célula toleram o alinhamento de coluna do Prettier (a
      // largura da coluna é a do maior valor, então o cabeçalho quase sempre tem
      // preenchimento à direita) — checar substring literal com espaço único quebra assim
      // que qualquer célula da coluna cresce.
      !/\|\s*Capacidade\s*\|\s*Netwin\s*\|\s*Kuwaiba\s*\|\s*NetBox\s*\|\s*Decisão Nexus\s*\|/u.test(
        benchmark[1],
      )
    ) {
      fail(`${definition.file}: ${id} sem tabela N.${benchmarkHeading} completa de benchmark`);
    } else {
      const rows = benchmark[1].split(/\r?\n/u).filter((line) => /^\| \*\*.+\|/u.test(line));
      if (rows.length === 0)
        fail(`${definition.file}: ${id} sem capacidade comparada no benchmark`);
      for (const row of rows) {
        const cells = row
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim());
        for (const systemCell of cells.slice(1, 4)) {
          if (
            /^(?:N\/A|Inexistente|\*\*Inexistente|Não(?! identificado no levantamento))/u.test(
              systemCell,
            )
          ) {
            fail(
              `${definition.file}: ${id} usa negativa categórica sem evidência no benchmark (${systemCell})`,
            );
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

  // `\s*` (não espaço literal único) em torno de cada pipe — mesma razão do check de
  // benchmark acima: o Prettier preenche a célula até a largura da coluna.
  const headerVersion = text.match(/\|\s*\*\*Versão\*\*\s*\|([^|]+)\|/u)?.[1];
  const revisionVersions = [...text.matchAll(/^\|\s*(\d+\.\d+)\s*\|[^|]+\|[^|]+\|/gmu)].map(
    (match) => match[1],
  );
  const latestRevision = revisionVersions.at(-1);
  if (!headerVersion || !latestRevision || normalizeVersion(headerVersion) !== latestRevision) {
    fail(
      `${definition.file}: versão do cabeçalho (${headerVersion?.trim() ?? 'ausente'}) difere da revisão (${latestRevision ?? 'ausente'})`,
    );
  }
  if (normalizeVersion(headerVersion ?? '') !== definition.version) {
    fail(
      `${definition.file}: versão esperada ${definition.version}, encontrada ${headerVersion?.trim() ?? 'ausente'}`,
    );
  }
  if (!/\|\s*\*\*Status\*\*\s*\|\s*Em elaboração\s*\|/u.test(text)) {
    fail(`${definition.file}: status do documento deve permanecer Em elaboração`);
  }
  if (/\bQ-\d{3}\b|\bD-\d+\b/u.test(text)) {
    fail(`${definition.file}: contém ID de questão/decisão sem namespace de domínio`);
  }
}

// O backlog único de questões e lacunas vive no GitHub Issues (labels `tipo:decisão`/`tipo:lacuna`).
// Só as decisões já resolvidas continuam num registro documental, para preservar o racional.
const canonicalDecisions = readFileSync(decisionsPath, 'utf8');
for (const definition of specs) {
  const text = readFileSync(join(specsDir, definition.file), 'utf8');
  for (const match of text.matchAll(/\bD-(?:GEO|RES|SVC)-\d{3}\b/gu)) {
    if (!canonicalDecisions.includes(match[0]))
      fail(`${definition.file}: decisão ${match[0]} ausente no registro central`);
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
  if (!benchmarkPlaybook.includes(`inspirations/${source}`))
    fail(`_benchmark-systems.md: fonte inspirations/${source} não referenciada`);
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

// Guarda contra o renascimento do backlog documental paralelo: `DEV-*`, `ADR-PEND-*` e `DEP-*`
// não têm mais nenhum uso legítimo em prosa (o backlog vive só no GitHub Issues). `Q-*` também
// não, exceto como referência histórica dentro de `architecture-decisions.md` §2 (ex.: "Antiga
// Q-GEO-009"), que documenta de onde uma decisão já resolvida veio.
const decisionsRelPath = relative(root, decisionsPath).split('\\').join('/');
for (const path of markdownFiles) {
  const text = readFileSync(path, 'utf8');
  const relPath = relative(root, path).split('\\').join('/');
  if (text.includes('reference-systems/'))
    fail(`${relPath}: referência obsoleta a reference-systems/`);
  if (/\bDEV-(?:GEO|RES|SVC|X)-\d{3}\b/u.test(text))
    fail(`${relPath}: referência a DEV-* — o backlog de lacunas vive só no GitHub Issues`);
  if (/\bADR-PEND-\d+B?\b/u.test(text))
    fail(`${relPath}: referência a ADR-PEND-* — decisões pendentes vivem só no GitHub Issues`);
  if (/\bDEP-\d{3}\b/u.test(text))
    fail(`${relPath}: referência a DEP-* — dependências bloqueantes vivem só no GitHub Issues`);
  if (relPath !== decisionsRelPath && /\bQ-(?:GEO|RES|SVC|ARQ|INT)-\d{3}\b/u.test(text))
    fail(`${relPath}: referência a Q-* — questões pendentes vivem só no GitHub Issues`);
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
    const target = match[1].trim().replace(/^<|>$/gu, '');
    if (/^(?:https?:\/\/|mailto:|#)/u.test(target)) continue;
    const filePart = decodeURIComponent(target.split('#', 1)[0]);
    if (!filePart) continue;
    const candidate = resolve(dirname(path), filePart);
    if (!existsSync(candidate)) fail(`${relPath}: link local inexistente ${target}`);
  }
}

if (errors.length > 0) {
  console.error(`Functional specs inválidas (${errors.length} problema(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    'Functional specs válidas: 62 requisitos, matrizes, JSON, links, benchmarks e decisões conferidos.',
  );
}
