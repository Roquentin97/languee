import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateCardDto {
  @ApiProperty({
    format: 'uuid',
    example: '1db3f769-e154-44c6-9b98-87de1037a395',
  })
  @IsUUID()
  deckId!: string;

  @ApiProperty({
    format: 'uuid',
    example: 'a2e4529c-cfb7-4f4f-bdb2-0c15e590bf55',
  })
  @IsUUID()
  definitionId!: string;
}
