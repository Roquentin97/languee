import { Injectable } from "@nestjs/common";

@Injectable()
export class RuleEngineMechanism {
  // F0: no rules — always returns null
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  apply(_lemmaCandidate: string, _pos: string | null): string | null {
    return null;
  }
}
