import { parseAdminRoleArgs } from './admin-role';

describe('parseAdminRoleArgs', () => {
  it('reads grant and revoke as a dry run by default', () => {
    expect(parseAdminRoleArgs(['grant', 'Ana@Example.com'])).toEqual({
      role: 'admin',
      email: 'ana@example.com',
      apply: false,
    });
    expect(parseAdminRoleArgs(['revoke', 'ana@example.com', '--yes'])).toEqual({
      role: 'user',
      email: 'ana@example.com',
      apply: true,
    });
  });

  it.each([[[]], [['grant']], [['promote', 'ana@example.com']]])(
    'rejects %j with the usage',
    (args) => {
      expect(() => parseAdminRoleArgs(args)).toThrow('Usage:');
    },
  );

  it('rejects unknown options instead of ignoring them', () => {
    expect(() =>
      parseAdminRoleArgs(['grant', 'ana@example.com', '--force']),
    ).toThrow('Unknown option --force');
  });
});
