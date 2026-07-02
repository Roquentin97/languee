import { ApiProperty } from '@nestjs/swagger';

export class LinkedDefinitionResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: 'a2e4529c-cfb7-4f4f-bdb2-0c15e590bf55',
  })
  id!: string;

  @ApiProperty({ example: 'verb' })
  partOfSpeech!: string;

  @ApiProperty({ example: 'to move at a speed faster than walking' })
  definition!: string;

  @ApiProperty({ example: 'sprint' })
  lemma!: string;

  @ApiProperty({ example: 'word' })
  kind!: string;
}

export class MeaningLinkResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '9f1c2b3a-4d5e-6f70-8192-a3b4c5d6e7f8',
  })
  id!: string;

  @ApiProperty({ enum: ['synonym', 'related'], example: 'synonym' })
  relationType!: string;

  @ApiProperty({ enum: ['user', 'provider'], example: 'user' })
  source!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: LinkedDefinitionResponseDto })
  definitionA!: LinkedDefinitionResponseDto;

  @ApiProperty({ type: LinkedDefinitionResponseDto })
  definitionB!: LinkedDefinitionResponseDto;
}

export class LinkedOtherDefinitionResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: 'a2e4529c-cfb7-4f4f-bdb2-0c15e590bf55',
  })
  definitionId!: string;

  @ApiProperty({ example: 'to move at a speed faster than walking' })
  definition!: string;

  @ApiProperty({ example: 'verb' })
  partOfSpeech!: string;

  @ApiProperty({ example: 'sprint' })
  lemma!: string;

  @ApiProperty({ example: 'word' })
  kind!: string;
}

export class MeaningLinkListItemResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '9f1c2b3a-4d5e-6f70-8192-a3b4c5d6e7f8',
  })
  id!: string;

  @ApiProperty({ enum: ['synonym', 'related'], example: 'synonym' })
  relationType!: string;

  @ApiProperty({ enum: ['user', 'provider'], example: 'user' })
  source!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: LinkedOtherDefinitionResponseDto })
  linked!: LinkedOtherDefinitionResponseDto;
}

export class MeaningLinkListResponseDto {
  @ApiProperty({ type: [MeaningLinkListItemResponseDto] })
  links!: MeaningLinkListItemResponseDto[];
}
