import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';

export class CreateMeaningLinkDto {
  @ApiProperty({
    format: 'uuid',
    example: 'a2e4529c-cfb7-4f4f-bdb2-0c15e590bf55',
  })
  @IsUUID()
  definitionAId!: string;

  @ApiProperty({
    format: 'uuid',
    example: '1db3f769-e154-44c6-9b98-87de1037a395',
  })
  @IsUUID()
  definitionBId!: string;

  @ApiProperty({ enum: ['synonym', 'related'], example: 'synonym' })
  @IsIn(['synonym', 'related'])
  relationType!: 'synonym' | 'related';
}
