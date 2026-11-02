import type {
  CardAnkiDroidExport,
  CardAnkiDroidExportAttempt,
} from '@prisma/client';
import type { AnkiDroidExportDetailResponseDto } from '../dto/ankidroid-export-detail-response.dto';
import type { AnkiDroidExportResponseDto } from '../dto/ankidroid-export-response.dto';

export function serializeExport(
  record: CardAnkiDroidExport,
): AnkiDroidExportResponseDto {
  return {
    id: record.id,
    cardId: record.cardId,
    status: record.status,
    failureReason: record.failureReason,
    failureMessage: record.failureMessage,
    ankiNoteId: record.ankiNoteId,
    ankiDeckId: record.ankiDeckId,
    ankiDeckNameSnapshot: record.ankiDeckNameSnapshot,
    ankiModelId: record.ankiModelId,
    ankiModelNameSnapshot: record.ankiModelNameSnapshot,
    templateVersion: record.templateVersion,
    lastAttemptedAt: record.lastAttemptedAt,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function serializeExportDetail(
  record: CardAnkiDroidExport & { attempts: CardAnkiDroidExportAttempt[] },
): AnkiDroidExportDetailResponseDto {
  return {
    ...serializeExport(record),
    attempts: record.attempts.map((attempt) => ({
      id: attempt.id,
      exportId: attempt.exportId,
      status: attempt.status,
      failureReason: attempt.failureReason,
      failureMessage: attempt.failureMessage,
      attemptedAt: attempt.attemptedAt,
    })),
  };
}
