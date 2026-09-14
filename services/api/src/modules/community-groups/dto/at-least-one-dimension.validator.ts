import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

// CreateCommunityGroupDto's cross-field rule (Build Plan Sprint 3,
// Decision Log #281): at least one of city / positionPlayed /
// careerTrack must be present, or the request is a 400.
//
// This codebase's established convention for cross-field rules is
// SERVICE-layer enforcement, not a DTO-level custom validator — see
// GrassrootsService.createFixture's teamBId/opponentName XOR check
// (grassroots/dto/create-fixture.dto.ts's own comment on why: "a
// cross-field rule, not expressible on a single-field decorator"). This
// task was specifically briefed to enforce this one at the DTO layer
// instead, via a real class-validator custom decorator — so
// IsAtLeastOneDimensionPresent is a genuinely NEW pattern for this
// codebase (confirmed by grep: zero `registerDecorator`/
// `ValidatorConstraint` usage anywhere in `services/api/src` before this
// PR), not a duplicate of an existing one. Flagged here, not silently
// introduced as if it were already this codebase's norm.
//
// Applied to `name` — an arbitrary anchor property, since the validator
// reads the whole DTO instance via `args.object`, not the decorated
// property's own value — so the whole rule attaches as ONE validation
// error on the DTO, rather than needing three separate decorators each
// carrying a fragment of one shared rule.
//
// Defence-in-depth: CommunityGroupsService.createGroup re-checks this
// same condition before writing to Postgres, so the rule holds even if a
// caller somehow bypasses the DTO layer (e.g. a future non-HTTP caller).
export function IsAtLeastOneDimensionPresent(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAtLeastOneDimensionPresent',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Provide at least one of city, positionPlayed, or careerTrack',
        ...validationOptions,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const obj = args.object as {
            city?: unknown;
            positionPlayed?: unknown;
            careerTrack?: unknown;
          };
          const present = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
          return present(obj.city) || present(obj.positionPlayed) || present(obj.careerTrack);
        },
      },
    });
  };
}
