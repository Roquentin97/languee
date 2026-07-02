import { ApiProperty } from '@nestjs/swagger';

export class OverlapDeckResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '1db3f769-e154-44c6-9b98-87de1037a395',
  })
  id!: string;

  @ApiProperty({ example: 'My Deck' })
  name!: string;
}

export class OverlapResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: 'a2e4529c-cfb7-4f4f-bdb2-0c15e590bf55',
  })
  definitionId!: string;

  @ApiProperty({
    format: 'uuid',
    example: 'b3f5630d-df58-4b58-8f4a-1e2f3a4b5c6d',
  })
  linkedDefinitionId!: string;

  @ApiProperty({ example: 'sprint' })
  linkedLemma!: string;

  @ApiProperty({ enum: ['synonym', 'related'], example: 'synonym' })
  relationType!: string;

  @ApiProperty({ type: [OverlapDeckResponseDto] })
  decks!: OverlapDeckResponseDto[];
}

export class OverlapsResponseDto {
  @ApiProperty({ type: [OverlapResponseDto] })
  overlaps!: OverlapResponseDto[];
}
