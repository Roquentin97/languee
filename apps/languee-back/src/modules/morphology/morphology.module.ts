import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '../core/http/http.module';
import { PrismaModule } from '../core/prisma/prisma.module';
import { MORPHOLOGY_PROVIDER } from './morphology-provider';
import { MorphologyService } from './morphology.service';
import { NlpMorphologyAdapter } from './nlp-morphology.adapter';

@Module({
  imports: [ConfigModule, HttpModule, PrismaModule],
  providers: [
    NlpMorphologyAdapter,
    { provide: MORPHOLOGY_PROVIDER, useExisting: NlpMorphologyAdapter },
    MorphologyService,
  ],
  exports: [MORPHOLOGY_PROVIDER, MorphologyService],
})
export class MorphologyModule {}
