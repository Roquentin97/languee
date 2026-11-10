import { projectParadigm, snapshotParadigm } from './paradigm';
import { checkTypedForms } from '../../../learning/reviews/lib/inflection-payload';
import { collectTargetForms } from '../../../learning/reviews/lib/masking';

describe('canonical POS-aware irregularity', () => {
  it.each([
    ['go', 'verb', 'went', 'past', true],
    ['child', 'noun', 'children', 'plural', true],
    ['good', 'adjective', 'better', 'comparative', true],
    ['well', 'adverb', 'better', 'comparative', true],
    ['walk', 'verb', 'walked', 'past', false],
    ['poise', 'verb', 'poised', 'past', false],
    ['study', 'verb', 'studied', 'past', false],
    ['stop', 'verb', 'stopped', 'past', false],
    ['happy', 'adjective', 'happier', 'comparative', false],
    ['big', 'adjective', 'biggest', 'superlative', false],
    ['well', 'noun', 'wells', 'plural', false],
    ['read', 'verb', 'read', 'past', true],
    ['sheep', 'noun', 'sheep', 'plural', true],
  ])('%s/%s', (lemma, pos, form, type, irregular) => {
    expect(
      projectParadigm(lemma, pos, [
        {
          form: form,
          partOfSpeech: pos,
          relationType: type,
        },
      ]).hasIrregularForms,
    ).toBe(irregular);
  });
  it('does not leak adverb forms into noun well', () => {
    expect(
      projectParadigm('well', 'noun', [
        { form: 'better', partOfSpeech: 'adverb', relationType: 'comparative' },
      ]),
    ).toEqual({
      inflectionForms: { type: 'noun', singular: 'well' },
      hasIrregularForms: false,
    });
  });
});

it('card snapshots retain variant answers and ignore spelling aliases', () => {
  const forms = [
    { form: 'was', partOfSpeech: 'verb', relationType: 'past' },
    { form: 'were', partOfSpeech: 'verb', relationType: 'past' },
    { form: 'bee', partOfSpeech: 'verb', relationType: 'alternative_spelling' },
  ];
  const snapshot = snapshotParadigm('be', 'verb', forms)!;
  expect(snapshot.variants).toEqual({ past: ['was', 'were'] });
  expect(checkTypedForms(snapshot, { past: 'were' }).past.correct).toBe(true);
  expect(collectTargetForms('be', snapshot)).toEqual(['be', 'was', 'were']);
});
