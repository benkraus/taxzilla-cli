#!/usr/bin/env bun

import { main } from "./main.tsx";

const exitCode = await main(process.argv.slice(2));

if (exitCode !== 0) {
  process.exitCode = exitCode;
}
