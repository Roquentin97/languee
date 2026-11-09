import { Inject, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../core/prisma/prisma.service';
import { PartOfSpeech } from '../vocabulary/enums/part-of-speech.enum';
import { MORPHOLOGY_PROVIDER } from './morphology-provider';
import type { MorphologyProvider } from './morphology-provider';
import { MorphologyModule } from './morphology.module';
import { MorphologyService } from './morphology.service';

@Injectable()
class Consumer {
  constructor(
    readonly morphology: MorphologyService,
    @Inject(MORPHOLOGY_PROVIDER) readonly provider: MorphologyProvider,
  ) {}
}
it('exports the morphology boundary and supports a replaceable provider through Nest DI', async () => {
  const provider = {
    getInflections: jest
      .fn()
      .mockResolvedValue([{ form: 'went', formType: 'past' }]),
    findLemmaCandidates: jest
      .fn()
      .mockResolvedValue([{ lemma: 'go', partOfSpeech: 'verb' }]),
  };
  const prisma = { wordForm: { createMany: jest.fn() } };
  const module = await Test.createTestingModule({
    imports: [MorphologyModule],
    providers: [Consumer],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(MORPHOLOGY_PROVIDER)
    .useValue(provider)
    .compile();
  try {
    const consumer = module.get(Consumer);
    expect(await consumer.provider.findLemmaCandidates('went', 'en')).toEqual([
      { lemma: 'go', partOfSpeech: 'verb' },
    ]);
    await consumer.morphology.indexParadigm({
      wordId: 'go-id',
      lemma: 'go',
      partOfSpeech: PartOfSpeech.VERB,
      language: 'en',
    });
    expect(provider.getInflections).toHaveBeenCalledWith('go', 'verb', 'en');
    expect(prisma.wordForm.createMany).toHaveBeenCalledTimes(1);
  } finally {
    await module.close();
  }
});
