import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ListOverlapsQueryDto {
  @ApiProperty({
    description: 'Comma-separated definition UUIDs (1 to 50)',
    example:
      'a2e4529c-cfb7-4f4f-bdb2-0c15e590bf55,1db3f769-e154-44c6-9b98-87de1037a395',
  })
  @IsString()
  @IsNotEmpty()
  definitionIds!: string;
}
