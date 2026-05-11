import type { Word } from '@prisma/client';

export interface IWordsRepository {
  findByLemma(lemma: string, language: string): Promise<Word | null>;
}
