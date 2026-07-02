import { Test, TestingModule } from '@nestjs/testing';
import { ChatProgressController } from './chat-progress.controller';
import { ChatProgressService } from './chat-progress.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';

const mockUser: CurrentUserPayload = {
  userId: 'user-id-1',
  sessionId: 'session-id-1',
};

const mockChatProgressService = {
  getProgress: jest.fn(),
};

describe('ChatProgressController', () => {
  let controller: ChatProgressController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatProgressController],
      providers: [
        { provide: ChatProgressService, useValue: mockChatProgressService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChatProgressController>(ChatProgressController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProgress()', () => {
    it('happy path — serializes a populated progress result', async () => {
      const computedAt = new Date('2026-07-03T00:00:00.000Z');
      mockChatProgressService.getProgress.mockResolvedValue({
        totalRaised: 12,
        totalResolved: 7,
        totalUserMessages: 140,
        activeConversations: 3,
        byType: [
          { type: 'overused_word', raised: 5, resolved: 3 },
          { type: 'grammar', raised: 4, resolved: 2 },
          { type: 'style', raised: 3, resolved: 2 },
        ],
        weeks: [
          { weekStart: '2026-06-15', raised: 4, resolved: 1, userMessages: 30 },
        ],
        computedAt,
      });

      const result = await controller.getProgress(mockUser);

      expect(result).toEqual({
        totals: {
          suggestionsRaised: 12,
          suggestionsResolved: 7,
          resolutionRate: 0.58,
          userMessages: 140,
          activeConversations: 3,
        },
        byType: [
          { type: 'overused_word', raised: 5, resolved: 3 },
          { type: 'grammar', raised: 4, resolved: 2 },
          { type: 'style', raised: 3, resolved: 2 },
        ],
        weeks: [
          { weekStart: '2026-06-15', raised: 4, resolved: 1, userMessages: 30 },
        ],
        computedAt,
      });
      expect(mockChatProgressService.getProgress).toHaveBeenCalledWith(
        'user-id-1',
      );
    });

    it('empty state — null resolutionRate and computedAt when the user has no stats yet', async () => {
      mockChatProgressService.getProgress.mockResolvedValue({
        totalRaised: 0,
        totalResolved: 0,
        totalUserMessages: 0,
        activeConversations: 0,
        byType: [
          { type: 'overused_word', raised: 0, resolved: 0 },
          { type: 'grammar', raised: 0, resolved: 0 },
          { type: 'style', raised: 0, resolved: 0 },
        ],
        weeks: [],
        computedAt: null,
      });

      const result = await controller.getProgress(mockUser);

      expect(result.totals.resolutionRate).toBeNull();
      expect(result.computedAt).toBeNull();
      expect(result.weeks).toEqual([]);
    });
  });
});
