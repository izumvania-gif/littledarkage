// Compiles ink source (with INCLUDEs) to the JSON the runtime loads.
// Used by the Vite plugin and by tests, so a broken story fails CI.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Compiler, CompilerOptions } from 'inkjs/full';

export interface InkCompileResult {
  json: string;
  warnings: string[];
}

export function compileInkFile(path: string): InkCompileResult {
  const root = dirname(path);
  const errors: string[] = [];
  const warnings: string[] = [];
  const fileHandler = {
    ResolveInkFilename: (filename: string) => resolve(root, filename),
    LoadInkFileContents: (filename: string) => readFileSync(filename, 'utf8'),
  };
  const options = new CompilerOptions(path, [], false, (message: string, type: number) => {
    // ErrorType: 0 = author note, 1 = warning, 2 = error
    if (type === 2) errors.push(message);
    else if (type === 1) warnings.push(message);
  }, fileHandler);
  let story: ReturnType<Compiler['Compile']> | null = null;
  try {
    story = new Compiler(readFileSync(path, 'utf8'), options).Compile();
  } catch {
    // inkjs throws a generic "Compilation failed"; the useful messages are in `errors`.
  }
  if (errors.length > 0 || !story) {
    throw new Error(`ink compile failed for ${path}:\n${errors.join('\n')}`);
  }
  return { json: story.ToJson() ?? '', warnings };
}
