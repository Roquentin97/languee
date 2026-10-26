/**
 * Pure helper for building definition-card "hint 1" glosses: short, truncated
 * versions of a definition, used to list the learner's other saved senses of
 * the same lemma without giving the full definition away.
 */

const GLOSS_MAX_LENGTH = 60;

export function truncateGloss(
  definition: string,
  maxLength: number = GLOSS_MAX_LENGTH,
): string {
  const trimmed = definition.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}
