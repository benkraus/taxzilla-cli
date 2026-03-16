export type CliRuntime = {
  readonly cwd: string;
  readonly now: () => Date;
  readonly generateReturnId: () => string;
};

export const defaultRuntime: CliRuntime = {
  cwd: process.cwd(),
  now: () => new Date(),
  generateReturnId: () => crypto.randomUUID(),
};
