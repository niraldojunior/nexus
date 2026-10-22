/**
 * Leitura de KML/KMZ em uma lista plana de placemarks.
 *
 * Os arquivos da pasta vêm de ferramentas diferentes: os Malbec têm namespace KML 2.2 e pastas
 * `Waypoints - <tipo>`, o SEGMENT 4 vem **sem** namespace (`<kml><Document>`) e com `gx:` declarado
 * em cada elemento, e os GlobeNet são KMZ (zip com `doc.kml`). Por isso a árvore é percorrida pelo
 * nome local do elemento, sem depender de namespace.
 */

import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';

export type Coordinate = [number, number];

export type KmlPlacemark = {
  /** Nome do placemark, aparado; vazio quando o KML não traz `<name>`. */
  name: string;
  /** Nomes das `<Folder>` ancestrais, da raiz para a folha (o `<Document>` não entra). */
  folderPath: string[];
  kind: 'line' | 'point';
  /** lon,lat — a altitude (Z) é descartada. */
  coordinates: Coordinate[];
};

export type KmlDocument = {
  /** Nome do arquivo de origem, com extensão. */
  file: string;
  placemarks: KmlPlacemark[];
};

const ELEMENT_NODE = 1;

const localNameOf = (element: Element): string =>
  (element.localName ?? element.nodeName).replace(/^.*:/, '');

const childElements = (element: Element): Element[] => {
  const children: Element[] = [];
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === ELEMENT_NODE) children.push(node as Element);
  }
  return children;
};

const childText = (element: Element, name: string): string => {
  const child = childElements(element).find((candidate) => localNameOf(candidate) === name);
  return (child?.textContent ?? '').trim();
};

/** `lon,lat[,z]` separados por espaço em branco; tuplas inválidas são ignoradas. */
export function parseCoordinates(text: string): Coordinate[] {
  const coordinates: Coordinate[] = [];
  for (const token of text.trim().split(/\s+/)) {
    if (!token) continue;
    const [lon, lat] = token.split(',').map(Number);
    if (lon === undefined || lat === undefined) continue;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    coordinates.push([lon, lat]);
  }
  return coordinates;
}

/** Geometrias de um placemark, inclusive as de `<MultiGeometry>`. */
function geometriesOf(element: Element): Array<{ kind: 'line' | 'point'; text: string }> {
  const found: Array<{ kind: 'line' | 'point'; text: string }> = [];
  for (const child of childElements(element)) {
    const name = localNameOf(child);
    if (name === 'LineString') found.push({ kind: 'line', text: childText(child, 'coordinates') });
    else if (name === 'Point') found.push({ kind: 'point', text: childText(child, 'coordinates') });
    else if (name === 'MultiGeometry') found.push(...geometriesOf(child));
  }
  return found;
}

export function parseKml(file: string, xml: string): KmlDocument {
  const parser = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: (message: string) => {
        throw new Error(`${file}: XML inválido — ${message}`);
      },
      fatalError: (message: string) => {
        throw new Error(`${file}: XML inválido — ${message}`);
      },
    },
  });
  // Alguns exportadores gravam BOM; o xmldom o trata como conteúdo antes da raiz.
  const source = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  const document = parser.parseFromString(source, 'text/xml');
  const root = document.documentElement;
  if (!root || localNameOf(root) !== 'kml') {
    throw new Error(`${file}: raiz <kml> ausente.`);
  }

  const placemarks: KmlPlacemark[] = [];
  const walk = (element: Element, folderPath: string[]): void => {
    for (const child of childElements(element)) {
      const name = localNameOf(child);
      if (name === 'Folder') {
        walk(child, [...folderPath, childText(child, 'name')]);
      } else if (name === 'Document') {
        walk(child, folderPath);
      } else if (name === 'Placemark') {
        const placemarkName = childText(child, 'name');
        for (const geometry of geometriesOf(child)) {
          const coordinates = parseCoordinates(geometry.text);
          if (coordinates.length === 0) continue;
          placemarks.push({ name: placemarkName, folderPath, kind: geometry.kind, coordinates });
        }
      }
    }
  };
  walk(root, []);
  return { file, placemarks };
}

/** `.kml` é lido direto; `.kmz` é um zip cujo primeiro `*.kml` (normalmente `doc.kml`) é o documento. */
export async function parseKmlSource(file: string, bytes: Buffer): Promise<KmlDocument> {
  if (extname(file).toLowerCase() !== '.kmz') return parseKml(file, bytes.toString('utf8'));
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && entry.name.toLowerCase().endsWith('.kml'),
  );
  const entry = entries.find((candidate) => basename(candidate.name) === 'doc.kml') ?? entries[0];
  if (!entry) throw new Error(`${file}: KMZ sem arquivo .kml.`);
  return parseKml(file, await entry.async('string'));
}

/** Todos os `.kml`/`.kmz` da pasta, em ordem alfabética (ordem estável entre execuções). */
export async function readSourceDir(directory: string): Promise<KmlDocument[]> {
  const files = (await readdir(directory))
    .filter((file) => ['.kml', '.kmz'].includes(extname(file).toLowerCase()))
    .sort((left, right) => left.localeCompare(right));
  const documents: KmlDocument[] = [];
  for (const file of files) {
    documents.push(await parseKmlSource(file, await readFile(join(directory, file))));
  }
  return documents;
}
