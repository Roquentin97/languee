import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export const MaxWhitespaceTokens = (
  maxTokens: number,
  validationOptions?: ValidationOptions,
) => {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxWhitespaceTokens',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [maxTokens],
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (typeof value !== 'string') return true;
          const limit = args.constraints[0] as number;
          const tokens = value.trim().split(/\s+/).filter(Boolean);
          return tokens.length <= limit;
        },
        defaultMessage() {
          return 'EXPRESSION_TOO_LONG';
        },
      },
    });
  };
};
