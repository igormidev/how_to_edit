#!/usr/bin/env node
import { run } from './lib/generate.mjs';
await run('transition', process.argv.slice(2));
