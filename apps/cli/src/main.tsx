import { runCli } from "./cli/run-cli";

export async function main(argv: string[]): Promise<number> {
  return runCli(argv);
}
