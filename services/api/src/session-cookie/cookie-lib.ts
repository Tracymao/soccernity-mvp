// `cookie` is already in the lockfile (a dependency of Express itself); it is now
// also a direct dependency of services/api. Version 0.7.x ships no type
// declarations, so the three calls this app makes are typed here.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const lib = require('cookie') as {
  parse(header: string): Record<string, string>;
  serialize(
    name: string,
    value: string,
    options?: {
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'strict' | 'lax' | 'none';
      path?: string;
      domain?: string;
      maxAge?: number;
      expires?: Date;
    },
  ): string;
};

export const parse = lib.parse;
export const serialize = lib.serialize;
