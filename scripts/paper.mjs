#!/usr/bin/env node
import { run } from './lib/generate.mjs';
await run('paper', process.argv.slice(2));
