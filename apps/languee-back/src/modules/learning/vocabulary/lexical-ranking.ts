import { normalizeSpelling } from '../../lexicon/enrichment/morphology/morphology-provider';
import type { LookupHeadword } from '../../lexicon/enrichment/dictionary/types/lookup-word.types';
import type { PartOfSpeech } from '../../lexicon/types/part-of-speech.enum';

export function rankLexicalGroups(
  headwords: LookupHeadword[],
  lemma: string,
  pos: PartOfSpeech | null,
  contextual: boolean,
) {
  const groups = headwords.flatMap((word) =>
    word.partsOfSpeech
      .filter((group) => group.definitions.length)
      .map((group) => ({
        wordId: word.wordId,
        lemma: word.lemma,
        partOfSpeech: group.partOfSpeech,
      })),
  );
  const matching =
    contextual && pos
      ? groups.filter((group) => group.partOfSpeech === pos)
      : [];
  const exact = matching.find(
    (group) => normalizeSpelling(group.lemma) === normalizeSpelling(lemma),
  );
  const preferred = exact ?? (matching.length === 1 ? matching[0] : null);
  groups.sort((a, b) => {
    const tier = (group: typeof a) =>
      group === exact ? 0 : matching.includes(group) ? 1 : 2;
    return (
      tier(a) - tier(b) ||
      a.lemma.localeCompare(b.lemma, 'en') ||
      a.partOfSpeech.localeCompare(b.partOfSpeech, 'en')
    );
  });
  return { groups, preferred };
}
