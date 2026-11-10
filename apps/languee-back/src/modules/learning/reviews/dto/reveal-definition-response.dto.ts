import { ApiProperty } from '@nestjs/swagger';

export class RevealDefinitionResponseDto {
  @ApiProperty({ example: 'run into' })
  lemma!: string;

  @ApiProperty({ example: 'To encounter unexpectedly.' })
  definition!: string;
}
