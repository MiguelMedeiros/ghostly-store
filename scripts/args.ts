/**
 * `--name value` pairs from the command line, as the scripts read them: a flag takes the argument after it, whatever it
 * is, and anything that is not a flag is skipped.
 */
export function parseArgs(argv: readonly string[]): Record<string, string | undefined> {
  const pairs: Array<[string, string | undefined]> = [];
  argv.forEach((arg, i) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), argv[i + 1]]);
  });
  return Object.fromEntries(pairs);
}
