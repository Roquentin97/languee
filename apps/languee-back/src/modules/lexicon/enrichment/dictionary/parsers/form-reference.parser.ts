import { PartOfSpeech } from '../../../types/part-of-speech.enum';
import type { RelationType } from '../../morphology/morphology-provider';

import type { DictionaryReference } from '../interfaces/dictionary-api-adapter.interface';

type Node = {
  tag: string;
  attrs: Record<string, string>;
  children: (Node | string)[];
};
const decode = (s: string): string =>
  s.replace(/&(?:amp|quot|lt|gt|nbsp|#39|#\d+|#x[\da-f]+);/gi, (v) => {
    const named: Record<string, string> = {
      '&amp;': '&',
      '&quot;': '"',
      '&lt;': '<',
      '&gt;': '>',
      '&nbsp;': ' ',
      '&#39;': "'",
    };
    if (named[v]) return named[v];
    const n = v.startsWith('&#x')
      ? parseInt(v.slice(3), 16)
      : parseInt(v.slice(2), 10);
    return n <= 0x10ffff ? String.fromCodePoint(n) : v;
  });
const text = (n: Node): string =>
  n.children
    .map((c) => (typeof c === 'string' ? c : text(c)))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
const walk = (n: Node): Node[] => [
  n,
  ...n.children.flatMap((c) => (typeof c === 'string' ? [] : walk(c))),
];
const cls = (n: Node, c: string): boolean =>
  (n.attrs.class ?? '').split(/\s+/).includes(c);

function parseHtml(html: string): {
  root: Node;
  broken: boolean;
  stack: Node[];
} {
  const root: Node = { tag: '', attrs: {}, children: [] };
  const stack = [root];
  let broken = false;
  for (const match of html.matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)) {
    const token = match[0];
    if (token.startsWith('<!--')) continue;
    if (!token.startsWith('<')) {
      stack[stack.length - 1].children.push(decode(token));
      continue;
    }
    const tag = token.match(/^<\/?([\w-]+)/)?.[1]?.toLowerCase();
    if (!tag) {
      broken = true;
      continue;
    }
    if (token.startsWith('</')) {
      if (stack[stack.length - 1].tag !== tag) {
        broken = true;
        continue;
      }
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of token.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
      attrs[a[1]] = decode(a[2] ?? a[3]);
    const node: Node = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (
      !['br', 'hr', 'link', 'meta', 'img', 'input', 'wbr'].includes(tag) &&
      !token.endsWith('/>')
    )
      stack.push(node);
  }
  return { root, broken, stack };
}

function classifyUnmarked(
  nodes: Node[],
  fullText: string,
  base: DictionaryReference,
): DictionaryReference | null {
  if (nodes.some((n) => cls(n, 'form-of-definition-link'))) return base;
  if (
    /\b(?:alternative (?:form|spelling)|inflection|singular|plural|past participle|simple past|comparative|superlative) (?:form |degree )?of\b/i.test(
      fullText,
    )
  )
    return base;
  const anchors = nodes.filter((n) => n.tag === 'a');
  if (
    anchors.length === 1 &&
    /\s/.test(text(anchors[0])) &&
    fullText.replace(/[.\s]+$/, '').toLowerCase() ===
      text(anchors[0]).toLowerCase()
  )
    return { ...base, category: 'other_reference' };
  return null;
}

function extractTargets(links: Node[]): string[] | null {
  const targets: string[] = [];
  for (const link of links) {
    const anchors = walk(link).filter((n) => n.tag === 'a');
    if (anchors.length !== 1) return null;
    const a = anchors[0];
    const title = a.attrs.title;
    const href = a.attrs.href ?? '';
    try {
      if (
        !title ||
        title.includes(':') ||
        !href.startsWith('/wiki/') ||
        decodeURIComponent(href.split('#')[0].slice(6)).replace(/_/g, ' ') !==
          title ||
        text(a) !== title
      )
        return null;
    } catch {
      return null;
    }
    targets.push(title);
  }
  return targets;
}

export function classifyReference(
  html: string,
  source: string,
  sourcePos: PartOfSpeech | null,
): DictionaryReference | null {
  const { root, broken, stack } = parseHtml(html);
  const nodes = walk(root);
  const markers = nodes.filter((n) => cls(n, 'form-of-definition'));
  const fullText = text(root);
  const base: DictionaryReference = {
    source,
    sourcePos,
    targets: [],
    targetPos: null,
    relationTypes: [],
    text: fullText,
    category: 'unresolved',
  };
  if (!markers.length) return classifyUnmarked(nodes, fullText, base);
  if (broken || stack.length !== 1 || markers.length !== 1) return base;
  const marker = markers[0];
  const phrase = text(marker).toLowerCase();
  const links = walk(marker).filter((n) => cls(n, 'form-of-definition-link'));
  const targets = extractTargets(links);
  if (!targets?.length) return base;
  const result = { ...base, targets: [...new Set(targets)] };
  return classifyPhrase(phrase, sourcePos, result);
}

const relationPatterns: [RegExp, RelationType][] = [
  [/\bplural\b/, 'plural'],
  [/\bsingular of\b/, 'singular'],
  [/\bcomparative\b/, 'comparative'],
  [/\bsuperlative\b/, 'superlative'],
  [/\b(?:simple past|past tense)\b/, 'past'],
  [/\bpast participle\b/, 'past_participle'],
  [/\bpresent participle\b/, 'present_participle'],
  [/\bgerund\b/, 'gerund'],
  [/\bthird-person singular\b.*\bpresent\b/, 'present_3sg'],
];

function classifyPhrase(
  phrase: string,
  sourcePos: PartOfSpeech | null,
  result: DictionaryReference,
): DictionaryReference {
  if (/\b(?:alternative|alternate) spelling of\b/.test(phrase))
    return {
      ...result,
      category: 'alternative_spelling',
      targetPos: sourcePos,
      relationTypes: ['alternative_spelling'],
    };
  if (/\b(?:alternative|alternate|variant|misspelling|obsolete)\b/.test(phrase))
    return { ...result, category: 'other_reference' };
  const relationPhrase = phrase.slice(0, phrase.indexOf(' of ')).trim();
  const grammar =
    /^(?:plural|singular|(?:comparative|superlative)(?: degree| form)?|(?:simple past|past tense|past participle|present participle|gerund)(?: and (?:simple past|past participle|present participle|gerund))?|third-person singular (?:simple )?present(?: indicative)?(?: form)?)$/;
  if (!grammar.test(relationPhrase)) return result;
  const types = relationPatterns
    .filter(([r]) => r.test(phrase))
    .map(([, t]) => t);
  const allowed: Record<string, string[]> = {
    noun: ['plural', 'singular'],
    verb: [
      'past',
      'past_participle',
      'present_participle',
      'gerund',
      'present_3sg',
      'present_non_3sg',
    ],
    adjective: ['comparative', 'superlative'],
    adverb: ['comparative', 'superlative'],
  };
  if (
    !types.length ||
    !types.every((t) => (allowed[sourcePos ?? ''] ?? []).includes(t)) ||
    /\b(?:noun|verb|adjective|adverb)\b/.test(phrase)
  )
    return result;
  return {
    ...result,
    category: 'morphological_reference',
    targetPos: sourcePos,
    relationTypes: types,
  };
}
