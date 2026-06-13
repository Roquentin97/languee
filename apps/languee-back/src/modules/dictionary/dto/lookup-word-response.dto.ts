import { ApiProperty } from '@nestjs/swagger';
import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';

export class DefinitionResultDto {
  @ApiProperty({ example: 'def_123' })
  id!: string;

  @ApiProperty({ enum: PartOfSpeech, example: PartOfSpeech.VERB })
  partOfSpeech!: PartOfSpeech;

  @ApiProperty({ example: 'To move at a speed faster than a walk.' })
  definition!: string;

  @ApiProperty({ example: 'She runs every morning.', nullable: true })
  example!: string | null;

  @ApiProperty({ example: 'free-dictionary' })
  provider!: string;

  @ApiProperty({ example: true })
  hasIrregularForms!: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    nullable: true,
    example: { base: 'run', past: 'ran' },
  })
  inflectionForms!: Record<string, string> | null;
}

export class LookupWordResponseDto {
  @ApiProperty({ example: 'run' })
  lemma!: string;

  @ApiProperty({ enum: ['cache', 'provider'], example: 'cache' })
  source!: 'cache' | 'provider';

  @ApiProperty({ type: [DefinitionResultDto] })
  definitions!: DefinitionResultDto[];
}
