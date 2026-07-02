import { splitSentences, truncateExcerpt } from './sentence-splitter';
import { tokenizeWordsPreservingCase } from './tokenize';

export type GrammarRule =
  | 'duplicated_word'
  | 'article_misuse'
  | 'lowercase_i'
  | 'sentence_case'
  | 'missing_terminal_punctuation';

export type GrammarFinding = {
  rule: GrammarRule;
  title: string;
  detail: string;
  excerpt: string;
  messageId: string;
};

export type UserMessageForGrammar = {
  id: string;
  content: string;
};

const MAX_FINDINGS = 5;
const MIN_WORDS_FOR_TERMINAL_PUNCTUATION_RULE = 8;
const VOWEL_LETTERS = new Set(['a', 'e', 'i', 'o', 'u']);
const TERMINAL_PUNCTUATION = new Set(['.', '!', '?']);

function isAcronymOrSingleLetter(word: string): boolean {
  if (word.length <= 1) return true;
  return word === word.toUpperCase();
}

/**
 * Per-message grammar heuristics, capped at 5 total findings across the
 * whole conversation. All rules are letter-based heuristics, not phonetic or
 * a real grammar checker:
 *  - Article misuse ("a"/"an") is judged purely by the next word's first
 *    letter, so it will incorrectly flag phonetic exceptions such as
 *    "an hour" (silent h) or "a university" (consonant sound). This is a
 *    documented limitation, not a bug.
 *  - Duplicated-word and repeated-phrase style detection operate within a
 *    single sentence, so a duplicate spanning a sentence boundary (e.g. the
 *    last word of one sentence matching the first word of the next) is
 *    intentionally NOT flagged.
 */
export function analyzeGrammar(
  messages: UserMessageForGrammar[],
): GrammarFinding[] {
  const findings: GrammarFinding[] = [];

  for (const message of messages) {
    if (findings.length >= MAX_FINDINGS) break;

    const sentences = splitSentences(message.content);

    for (const sentence of sentences) {
      if (findings.length >= MAX_FINDINGS) break;

      const words = tokenizeWordsPreservingCase(sentence);

      for (let i = 1; i < words.length && findings.length < MAX_FINDINGS; i++) {
        if (words[i].toLowerCase() === words[i - 1].toLowerCase()) {
          findings.push({
            rule: 'duplicated_word',
            title: `Repeated word: "${words[i - 1]}"`,
            detail: `You wrote "${words[i - 1]} ${words[i]}" — remove the duplicate.`,
            excerpt: truncateExcerpt(sentence),
            messageId: message.id,
          });
        }
      }

      for (let i = 1; i < words.length && findings.length < MAX_FINDINGS; i++) {
        const prev = words[i - 1].toLowerCase();
        const next = words[i];
        if (prev !== 'a' && prev !== 'an') continue;
        if (isAcronymOrSingleLetter(next)) continue;

        const nextStartsWithVowel = VOWEL_LETTERS.has(next[0].toLowerCase());

        if (prev === 'a' && nextStartsWithVowel) {
          findings.push({
            rule: 'article_misuse',
            title: 'Article usage',
            detail: `Consider "an ${next}" instead of "a ${next}".`,
            excerpt: truncateExcerpt(sentence),
            messageId: message.id,
          });
        } else if (prev === 'an' && !nextStartsWithVowel) {
          findings.push({
            rule: 'article_misuse',
            title: 'Article usage',
            detail: `Consider "a ${next}" instead of "an ${next}".`,
            excerpt: truncateExcerpt(sentence),
            messageId: message.id,
          });
        }
      }

      for (const word of words) {
        if (findings.length >= MAX_FINDINGS) break;
        if (word === 'i') {
          findings.push({
            rule: 'lowercase_i',
            title: 'Capitalize "I"',
            detail: 'The pronoun "I" should always be capitalized.',
            excerpt: truncateExcerpt(sentence),
            messageId: message.id,
          });
        }
      }

      if (findings.length < MAX_FINDINGS && /[a-z]/.test(sentence.charAt(0))) {
        findings.push({
          rule: 'sentence_case',
          title: 'Start sentences with a capital letter',
          detail: `"${truncateExcerpt(sentence)}" should start with a capital letter.`,
          excerpt: truncateExcerpt(sentence),
          messageId: message.id,
        });
      }
    }

    if (findings.length < MAX_FINDINGS) {
      const wordCount = tokenizeWordsPreservingCase(message.content).length;
      const trimmed = message.content.trim();
      const lastChar = trimmed.charAt(trimmed.length - 1);

      if (
        wordCount >= MIN_WORDS_FOR_TERMINAL_PUNCTUATION_RULE &&
        trimmed.length > 0 &&
        !TERMINAL_PUNCTUATION.has(lastChar)
      ) {
        findings.push({
          rule: 'missing_terminal_punctuation',
          title: 'Missing terminal punctuation',
          detail:
            'Long messages should end with a period, question mark, or exclamation point.',
          excerpt: truncateExcerpt(message.content),
          messageId: message.id,
        });
      }
    }
  }

  return findings;
}
