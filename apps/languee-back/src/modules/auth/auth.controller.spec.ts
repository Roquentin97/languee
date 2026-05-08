import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

const mockAuthService = {
  register: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('register', () => {
    it('registers a user through AuthService', async () => {
      const dto = { email: 'new@example.com', password: 'password123' };
      const user = {
        id: 'user-123',
        email: dto.email,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      mockAuthService.register.mockResolvedValue(user);

      await expect(controller.register(dto)).resolves.toBe(user);
      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
    });

    it('validates email and password requirements on RegisterDto', async () => {
      const dto = new RegisterDto();
      dto.email = 'not-an-email';
      dto.password = 'short';

      const errors = await validate(dto);
      const invalidProperties = errors.map((error) => error.property);

      expect(invalidProperties).toEqual(
        expect.arrayContaining(['email', 'password']),
      );
    });
  });
});
