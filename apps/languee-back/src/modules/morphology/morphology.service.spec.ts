import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../core/prisma/prisma.service';
import { PartOfSpeech } from '../vocabulary/enums/part-of-speech.enum';
import { MORPHOLOGY_PROVIDER } from './morphology-provider';
import { MorphologyService } from './morphology.service';

const entry = {
  wordId: 'go-id',
  lemma: 'go',
  partOfSpeech: PartOfSpeech.VERB,
  language: 'en',
};
describe('MorphologyService', () => {
  let service: MorphologyService;
  let module: TestingModule;
  const prisma = { wordForm: { createMany: jest.fn(), findMany: jest.fn() } };
  const provider = {
    getInflections: jest.fn(),
    findLemmaCandidates: jest.fn(),
  };
  beforeEach(async () => {
    jest.resetAllMocks();
    module = await Test.createTestingModule({
      providers: [
        MorphologyService,
        { provide: PrismaService, useValue: prisma },
        { provide: MORPHOLOGY_PROVIDER, useValue: provider },
      ],
    }).compile();
    service = module.get(MorphologyService);
  });
  afterEach(() => module.close());
  it('indexes a verified canonical paradigm with distinct grammatical types', async () => {
    provider.getInflections.mockResolvedValue([
      { form: 'GONE', formType: 'past_participle' },
      { form: 'went', formType: 'past' },
      { form: 'has gone', formType: 'past_participle' },
    ]);
    await service.indexParadigm(entry);
    expect(provider.getInflections).toHaveBeenCalledWith(
      'go',
      PartOfSpeech.VERB,
      'en',
    );
    expect(prisma.wordForm.createMany).toHaveBeenCalledWith({
      data: [
        {
          wordId: 'go-id',
          form: 'gone',
          partOfSpeech: 'verb',
          relationType: 'past_participle',
        },
        {
          wordId: 'go-id',
          form: 'went',
          partOfSpeech: 'verb',
          relationType: 'past',
        },
      ],
      skipDuplicates: true,
    });
  });
  it('does not invent missing forms for an empty resource paradigm', async () => {
    provider.getInflections.mockResolvedValue([]);
    await service.indexParadigm(entry);
    expect(prisma.wordForm.createMany).not.toHaveBeenCalled();
  });
  it('propagates morphology failures without writing a paradigm', async () => {
    provider.getInflections.mockRejectedValue(new Error('outage'));
    await expect(service.indexParadigm(entry)).rejects.toThrow('outage');
    expect(prisma.wordForm.createMany).not.toHaveBeenCalled();
  });
  it('records normalized validated relationships without collapsing grammatical types', async () => {
    await service.recordValidatedRelationships(
      'see-id',
      ' SAW ',
      PartOfSpeech.VERB,
      ['past', 'past_participle'],
    );
    expect(prisma.wordForm.createMany).toHaveBeenCalledWith({
      data: [
        {
          wordId: 'see-id',
          form: 'saw',
          partOfSpeech: 'verb',
          relationType: 'past',
        },
        {
          wordId: 'see-id',
          form: 'saw',
          partOfSpeech: 'verb',
          relationType: 'past_participle',
        },
      ],
      skipDuplicates: true,
    });
  });
  it('ignores an empty relationship set', async () => {
    await service.recordValidatedRelationships(
      'see-id',
      'saw',
      PartOfSpeech.VERB,
      [],
    );
    expect(prisma.wordForm.createMany).not.toHaveBeenCalled();
  });
  it('finds POS-scoped origins in the requested language', async () => {
    const origins = [
      {
        wordId: 'well-id',
        partOfSpeech: 'adverb',
        relationType: 'comparative',
      },
    ];
    prisma.wordForm.findMany.mockResolvedValue(origins);
    expect(await service.findOrigins('BETTER', 'en')).toEqual(origins);
    expect(prisma.wordForm.findMany).toHaveBeenCalledWith({
      where: { form: 'better', word: { language: 'en' } },
      select: { wordId: true, partOfSpeech: true, relationType: true },
    });
  });
  it('returns no origins for a missing spelling', async () => {
    prisma.wordForm.findMany.mockResolvedValue([]);
    expect(await service.findOrigins('unknown', 'en')).toEqual([]);
  });
  it('describes several words and POS in one query, isolating forms and aliases', async () => {
    prisma.wordForm.findMany.mockResolvedValue([
      {
        wordId: 'well-id',
        form: 'better',
        partOfSpeech: 'adverb',
        relationType: 'comparative',
      },
      {
        wordId: 'well-id',
        form: 'best',
        partOfSpeech: 'adverb',
        relationType: 'superlative',
      },
      {
        wordId: 'well-id',
        form: 'wells',
        partOfSpeech: 'noun',
        relationType: 'plural',
      },
      {
        wordId: 'be-id',
        form: 'was',
        partOfSpeech: 'verb',
        relationType: 'past',
      },
      {
        wordId: 'be-id',
        form: 'were',
        partOfSpeech: 'verb',
        relationType: 'past',
      },
      {
        wordId: 'be-id',
        form: 'bee',
        partOfSpeech: 'verb',
        relationType: 'alternative_spelling',
      },
    ]);
    const result = await service.describeEntries([
      { wordId: 'well-id', lemma: 'well', partOfSpeech: 'adverb' },
      { wordId: 'well-id', lemma: 'well', partOfSpeech: 'noun' },
      { wordId: 'be-id', lemma: 'be', partOfSpeech: 'verb' },
      { wordId: 'be-id', lemma: 'be', partOfSpeech: 'verb' },
    ]);
    expect(prisma.wordForm.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.wordForm.findMany).toHaveBeenCalledWith({
      where: { wordId: { in: ['well-id', 'be-id'] } },
    });
    expect(result.get('well-id')?.get('noun')).toEqual({
      inflectionForms: { type: 'noun', singular: 'well', plural: 'wells' },
      snapshot: { type: 'noun', singular: 'well', plural: 'wells' },
      hasIrregularForms: false,
    });
    expect(result.get('well-id')?.get('adverb')?.hasIrregularForms).toBe(true);
    expect(result.get('be-id')?.get('verb')?.snapshot?.variants).toEqual({
      past: ['was', 'were'],
    });
    expect(JSON.stringify(result.get('be-id')?.get('verb'))).not.toContain(
      'bee',
    );
    expect(result.get('be-id')?.size).toBe(1);
  });
  it('describes an entry without known forms without inferring irregularity', async () => {
    prisma.wordForm.findMany.mockResolvedValue([]);
    const result = await service.describeEntries([entry]);
    expect(result.get('go-id')?.get('verb')).toEqual({
      inflectionForms: { type: 'verb', base: 'go' },
      snapshot: { type: 'verb', base: 'go' },
      hasIrregularForms: false,
    });
  });
  it('does not query storage for an empty entry list', async () => {
    expect(await service.describeEntries([])).toEqual(new Map());
    expect(prisma.wordForm.findMany).not.toHaveBeenCalled();
  });
});
