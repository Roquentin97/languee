import { Injectable } from '@nestjs/common';
import {
  ILemmatizer,
  LemmatizedOutput,
  PreLemmatizedOutput,
} from '../../interfaces/pipeline.interfaces';
import { IrregularTableMechanism } from './irregular-table.mechanism';
import { RuleEngineMechanism } from './rule-engine.mechanism';
import { PassthroughMechanism } from './passthrough.mechanism';

@Injectable()
export class Lemmatizer implements ILemmatizer {
  constructor(
    private readonly irregularTable: IrregularTableMechanism,
    private readonly ruleEngine: RuleEngineMechanism,
    private readonly passthrough: PassthroughMechanism,
  ) {}

  lemmatize(input: PreLemmatizedOutput): LemmatizedOutput {
    const irreg = this.irregularTable.lookup(input.lemma, null);
    if (irreg !== null) {
      return { lemma: irreg };
    }

    const ruled = this.ruleEngine.apply(input.lemma, null);
    if (ruled !== null) {
      return { lemma: ruled };
    }

    const pt = this.passthrough.resolve(input.lemma);
    return { lemma: pt };
  }
}
