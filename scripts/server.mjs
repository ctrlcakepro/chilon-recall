#!/usr/bin/env node

import { startStdioServer } from "../src/server.mjs";

startStdioServer().catch((error) => {
  process.stderr.write(`Chilon Recall failed to start: ${error.message}\n`);
  process.exitCode = 1;
});

