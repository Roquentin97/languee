import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../core/prisma/prisma.service';
import { UsersService } from './users.service';

const mockUser = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  email: 'test@example.com',
  passwordHash: 'hashed_password',
  createdAt: new Date('2026-03-22T00:00:00.000Z'),
  updatedAt: new Date('2026-03-22T00:00:00.000Z'),
};

const mockPrismaService = {
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── create() ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('happy path — returns a User with all five fields populated', async () => {
      mockPrismaService.user.create.mockResolvedValue(mockUser);

      const result = await service.create(
        'test@example.com',
        'hashed_password',
      );

      expect(result).toEqual(mockUser);
      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect(result.passwordHash).toBe(mockUser.passwordHash);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: { email: 'test@example.com', passwordHash: 'hashed_password' },
      });
    });

    it('edge case — duplicate email propagates Prisma P2002 unique constraint error', async () => {
      const prismaError = new PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        { code: 'P2002', clientVersion: '6.0.0' },
      );
      mockPrismaService.user.create.mockRejectedValue(prismaError);

      await expect(
        service.create('duplicate@example.com', 'hashed_password'),
      ).rejects.toThrow(PrismaClientKnownRequestError);

      await expect(
        service.create('duplicate@example.com', 'hashed_password'),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  // ── findByEmail() ─────────────────────────────────────────────────────────

  describe('findByEmail()', () => {
    it('happy path — returns the matching User when email exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('edge case — returns null (not undefined) when email does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.findByEmail('nobody@example.com');

      expect(result).toBeNull();
      expect(result).not.toBeUndefined();
    });
  });

  // ── findById() ────────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('happy path — returns the matching User when id exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findById(mockUser.id);

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
    });

    it('edge case — returns null when id does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.findById(
        '00000000-0000-0000-0000-000000000000',
      );

      expect(result).toBeNull();
      expect(result).not.toBeUndefined();
    });

    it('edge case — returns null (no unhandled exception) for a malformed non-UUID string', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.findById('not-a-uuid');

      expect(result).toBeNull();
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'not-a-uuid' },
      });
    });
  });

  // ── DI / module wiring ────────────────────────────────────────────────────

  describe('NestJS DI', () => {
    it('UsersService is injectable when PrismaService is provided', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: PrismaService, useValue: mockPrismaService },
        ],
      }).compile();

      const resolvedService = module.get<UsersService>(UsersService);
      expect(resolvedService).toBeInstanceOf(UsersService);
    });
  });
});
