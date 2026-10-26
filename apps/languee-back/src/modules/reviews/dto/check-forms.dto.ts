import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsNotEmptyObject } from 'class-validator';

export class CheckFormsDto {
  @ApiProperty({
    description:
      'The typed paradigm forms, keyed by form name (e.g. "past"). Only used for feedback - it has no effect on scheduling.',
    example: { base: 'run', past: 'ran', present3sg: 'runs' },
  })
  @IsObject()
  @IsNotEmptyObject()
  typedForms!: Record<string, string>;
}
