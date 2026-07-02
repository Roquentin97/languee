import { splitSentences, truncateExcerpt } from './sentence-splitter';
import { STOPWORDS } from './stopwords';
import { tokenizeWordsPreservingCase } from './tokenize';

export type StylePattern =
  | 'repeated_sentence_starter'
  | 'long_sentence'
  | 'repeated_phrase';

export type StyleFinding = {
  pattern: StylePattern;
  title: string;
  detail: string;
  payload: Record<string, string | number>;
};

const MAX_FINDINGS = 5;
const LONG_SENTENCE_WORD_THRESHOLD = 30;
const REPEATED_STARTER_THRESHOLD = 3;
const REPEATED_PHRASE_THRESHOLD = 3;
const PHRASE_LENGTH = 3;

function wordsOf(sentence: string): string[] {
  return tokenizeWordsPreservingCase(sentence);
}

/**
 * Style pattern heuristics across all user messages, capped at 5 total
 * findings. Phrase and sentence-starter repetition are computed within a
 * single sentence / across sentences respectively but never span a
 * message-to-message boundary check beyond simple concatenation — see each
 * section below.
 */
export function analyzeStyle(userMessages: string[]): StyleFinding[] {
  const allSentences = userMessages.flatMap(splitSentences);
  const findings: StyleFinding[] = [];

  // 1. Repeated sentence starters (>= 3 sentences starting with the same
  // non-stopword token).
  const starterCounts = new Map<string, number>();
  for (const sentence of allSentences) {
    const first = wordsOf(sentence)[0]?.toLowerCase();
    if (first === undefined || STOPWORDS.has(first)) continue;
    starterCounts.set(first, (starterCounts.get(first) ?? 0) + 1);
  }
  for (const [word, count] of starterCounts) {
    if (findings.length >= MAX_FINDINGS) break;
    if (count >= REPEATED_STARTER_THRESHOLD) {
      findings.push({
        pattern: 'repeated_sentence_starter',
        title: `Sentences repeatedly start with "${word}"`,
        detail: `${count} sentences start with "${word}". Try varying your sentence openings.`,
        payload: { word, count },
      });
    }
  }

  // 2. Long sentences (> 30 words).
  for (const sentence of allSentences) {
    if (findings.length >= MAX_FINDINGS) break;
    const wordCount = wordsOf(sentence).length;
    if (wordCount > LONG_SENTENCE_WORD_THRESHOLD) {
      findings.push({
        pattern: 'long_sentence',
        title: 'Long sentence',
        detail: `This sentence has ${wordCount} words. Consider splitting it into shorter sentences.`,
        payload: { wordCount, excerpt: truncateExcerpt(sentence) },
      });
    }
  }

  // 3. Repeated exact 3-word phrases (computed within a sentence, not
  // spanning a sentence boundary, consistent with the grammar analyzer's
  // duplicated-word rule).
  const phraseCounts = new Map<string, number>();
  for (const sentence of allSentences) {
    const lowerWords = wordsOf(sentence).map((w) => w.toLowerCase());
    for (let i = 0; i + PHRASE_LENGTH <= lowerWords.length; i++) {
      const phrase = lowerWords.slice(i, i + PHRASE_LENGTH).join(' ');
      phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }
  }
  for (const [phrase, count] of phraseCounts) {
    if (findings.length >= MAX_FINDINGS) break;
    if (count >= REPEATED_PHRASE_THRESHOLD) {
      findings.push({
        pattern: 'repeated_phrase',
        title: `Repeated phrase: "${phrase}"`,
        detail: `The phrase "${phrase}" appears ${count} times. Consider varying your wording.`,
        payload: { phrase, count },
      });
    }
  }

  return findings;
}
