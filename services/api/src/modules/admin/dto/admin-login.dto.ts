// Deliberately re-exported (not duplicated) from the User-facing
// modules/auth/dto/login.dto.ts — LoginDto is a pure request-shape
// validator ({ email, password }, both plain class-validator decorators)
// with zero User-specific typing or behavior, so reusing the class
// directly is safe and avoids maintaining two field-for-field-identical
// DTOs in sync by hand. This is the same "share the generic utility,
// keep the auth/session internals genuinely separate" line
// admin-token.service.ts's header comment draws for PasswordService.
export { LoginDto as AdminLoginDto } from '../../auth/dto/login.dto';
