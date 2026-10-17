/* eslint-env jest */
import { UsernamePolicyService } from './username-policy.service';

// Spec helper: a UsernamePolicyService that allows everything, so specs about
// other UsersService behaviour need not stub the policy's own queries. The
// policy itself is covered by username-policy.service.spec.ts.
export function policyStub(overrides: Partial<Record<'assertAssignable', jest.Mock>> = {}): UsernamePolicyService {
  return { assertAssignable: jest.fn(async () => undefined), ...overrides } as unknown as UsernamePolicyService;
}
