import { Injectable } from '@nestjs/common';
import type { Definition } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { IDefinitionsRepository } from '../interfaces/definitions-repository.interface';

@Injectable()
export class PrismaDefinitionsRepository implements IDefinitionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByWordId(wordId: string): Promise<Definition[]> {
    return this.prisma.definition.findMany({ where: { wordId } });
  }
}
