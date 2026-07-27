import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RevealedWordDto {
  @ApiProperty({ example: 'come across' })
  lemma!: string;

  @ApiPropertyOptional({
    description: 'Phonetic transcription of the word, when known',
    example: '/kʌm əˈkɹɒs/',
    nullable: true,
  })
  ipa!: string | null;

  @ApiPropertyOptional({
    description: 'Inflection forms effective for this card',
    example: { type: 'verb', base: 'come across', past: 'came across' },
    nullable: true,
  })
  inflectionForms!: Record<string, string> | null;
}

export class AnswerCardResponseDto {
  @ApiProperty({
    enum: ['correct', 'incorrect'],
    example: 'correct',
  })
  result!: 'correct' | 'incorrect';

  @ApiPropertyOptional({
    description: 'The accepted form as stored, only present when correct',
    example: 'come across',
    nullable: true,
  })
  matchedForm!: string | null;

  @ApiPropertyOptional({
    description:
      'Word details revealed after a correct answer: lemma, transcription, and inflections. Null while incorrect.',
    type: RevealedWordDto,
    nullable: true,
  })
  revealed!: RevealedWordDto | null;
}
