import { Injectable } from '@nestjs/common';

@Injectable()
export class IrregularTableMechanism {
  // F0: empty table — always returns null
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  lookup(_lemmaCandidate: string, _pos: string | null): string | null {
    return null;
  }
}
