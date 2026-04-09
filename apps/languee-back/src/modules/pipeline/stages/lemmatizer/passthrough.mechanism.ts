import { Injectable } from "@nestjs/common";

@Injectable()
export class PassthroughMechanism {
  // Fallback — returns the candidate as-is
  resolve(lemmaCandidate: string): string {
    return lemmaCandidate;
  }
}
