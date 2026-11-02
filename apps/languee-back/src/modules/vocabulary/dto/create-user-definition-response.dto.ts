import { ApiProperty } from '@nestjs/swagger';
import { PartOfSpeech } from '../enums/part-of-speech.enum';

export class CreateUserDefinitionResponseDto {
  @ApiProperty({ example: 'def_123' })
  id!: string;

  @ApiProperty({ example: 'word_123' })
  wordId!: string;

  @ApiProperty({ example: 'run into' })
  lemma!: string;

  @ApiProperty({
    enum: ['word', 'phrasal_verb', 'expression'],
    example: 'phrasal_verb',
  })
  kind!: 'word' | 'phrasal_verb' | 'expression';

  @ApiProperty({ enum: PartOfSpeech, example: PartOfSpeech.PHRASE })
  partOfSpeech!: PartOfSpeech;

  @ApiProperty({ example: 'To encounter someone or something unexpectedly.' })
  definition!: string;

  @ApiProperty({
    example: 'I ran into an old friend yesterday.',
    nullable: true,
  })
  example!: string | null;

  @ApiProperty({ example: 'user' })
  provider!: string;
}
