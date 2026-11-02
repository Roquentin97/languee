import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RecordAttemptDto {
  @ApiProperty({
    enum: ['failed', 'completed'],
    description: 'Status of this export attempt',
    example: 'completed',
  })
  @IsIn(['failed', 'completed'])
  @IsNotEmpty()
  status!: 'failed' | 'completed';

  @ApiPropertyOptional({
    description: 'Machine-readable failure reason code',
    example: 'DECK_NOT_FOUND',
  })
  @IsString()
  @IsOptional()
  failureReason?: string;

  @ApiPropertyOptional({
    description: 'Human-readable failure message',
    example: 'The target AnkiDroid deck could not be found',
  })
  @IsString()
  @IsOptional()
  failureMessage?: string;

  @ApiPropertyOptional({
    description: 'Anki note ID assigned upon successful export',
    example: '1234567890',
  })
  @IsString()
  @IsOptional()
  ankiNoteId?: string;

  @ApiPropertyOptional({
    description: 'Anki deck ID used for the export',
    example: '9876543210',
  })
  @IsString()
  @IsOptional()
  ankiDeckId?: string;

  @ApiPropertyOptional({
    description: 'Snapshot of the Anki deck name at export time',
    example: 'English Vocabulary',
  })
  @IsString()
  @IsOptional()
  ankiDeckNameSnapshot?: string;

  @ApiPropertyOptional({
    description: 'Anki model (note type) ID used for the export',
    example: '1122334455',
  })
  @IsString()
  @IsOptional()
  ankiModelId?: string;

  @ApiPropertyOptional({
    description: 'Snapshot of the Anki model name at export time',
    example: 'Basic',
  })
  @IsString()
  @IsOptional()
  ankiModelNameSnapshot?: string;

  @ApiPropertyOptional({
    description: 'Template version used for generating the Anki card',
    example: '1.0.0',
  })
  @IsString()
  @IsOptional()
  templateVersion?: string;
}
