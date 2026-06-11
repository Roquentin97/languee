import { ApiProperty } from '@nestjs/swagger';

class MobileRegisterUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;
}

export class MobileRegisterResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  sessionId: string;

  @ApiProperty({ type: MobileRegisterUserDto })
  user: { id: string; email: string };
}
