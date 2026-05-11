import type { Definition } from '@prisma/client';

export interface IDefinitionsRepository {
  findByWordId(wordId: string): Promise<Definition[]>;
}
