import { NlpModule } from '../nlp/nlp.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../system/core/prisma/prisma.module';
import { MORPHOLOGY_PROVIDER } from './morphology-provider';
import { MorphologyService } from './morphology.service';
import { NlpMorphologyAdapter } from './nlp-morphology.adapter';

@Module({
  imports: [NlpModule, PrismaModule],
  providers: [
    NlpMorphologyAdapter,
    { provide: MORPHOLOGY_PROVIDER, useExisting: NlpMorphologyAdapter },
    MorphologyService,
  ],
  exports: [MORPHOLOGY_PROVIDER, MorphologyService],
})
export class MorphologyModule {}
