import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MobileRefreshRequestDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  refreshToken: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  sessionId: string;
}
