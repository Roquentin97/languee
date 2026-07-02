import type { ApiPropertyOptions } from '@nestjs/swagger';

export type AdjectiveInflections = {
  type: 'adjective';
  positive: string;
  comparative?: string;
  superlative?: string;
};

export type VerbInflections = {
  type: 'verb';
  base: string;
  past?: string;
  present3sg?: string;
  presentNon3sg?: string;
  pastParticiple?: string;
  gerundParticiple?: string;
};

export type NounInflections = {
  type: 'noun';
  singular?: string;
  plural?: string;
};

export type ExpressionInflections = {
  type: 'expression';
  contextForm: string;
};

/**
 * Inflection forms sourced directly from the NLP service's `extra_forms` map
 * for languages the English lemminflect-derived shapes don't cover (Spanish,
 * German). `type` carries the language code so masking/answer-matching can
 * treat every non-`type` key as an accepted form regardless of its name.
 */
export type LanguageExtraInflections = { type: 'es' | 'de' } & {
  [form: string]: string;
};

export type InflectionForms =
  | AdjectiveInflections
  | VerbInflections
  | NounInflections
  | ExpressionInflections
  | LanguageExtraInflections;

export const INFLECTION_FORMS_SWAGGER: ApiPropertyOptions = {
  nullable: true,
  oneOf: [
    {
      type: 'object',
      required: ['type', 'positive'],
      properties: {
        type: { type: 'string', enum: ['adjective'] },
        positive: { type: 'string', example: 'good' },
        comparative: { type: 'string', example: 'better' },
        superlative: { type: 'string', example: 'best' },
      },
    },
    {
      type: 'object',
      required: ['type', 'base'],
      properties: {
        type: { type: 'string', enum: ['verb'] },
        base: { type: 'string', example: 'see' },
        past: { type: 'string', example: 'saw' },
        present3sg: { type: 'string', example: 'sees' },
        presentNon3sg: { type: 'string', example: 'see' },
        pastParticiple: { type: 'string', example: 'seen' },
        gerundParticiple: { type: 'string', example: 'seeing' },
      },
    },
    {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['noun'] },
        singular: { type: 'string', example: 'owl' },
        plural: { type: 'string', example: 'owls' },
      },
    },
    {
      type: 'object',
      required: ['type', 'contextForm'],
      properties: {
        type: { type: 'string', enum: ['expression'] },
        contextForm: { type: 'string', example: 'ran into' },
      },
    },
    {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['es', 'de'] },
      },
      additionalProperties: { type: 'string' },
    },
  ],
  discriminator: { propertyName: 'type' },
};
