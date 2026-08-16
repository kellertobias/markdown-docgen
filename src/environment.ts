const PLACEHOLDER = /(?<!\\)\$\{([A-Z_][A-Z0-9_]*)\}/gu;
const ESCAPED_PLACEHOLDER = /\\(\$\{[A-Z_][A-Z0-9_]*\})/gu;

export function expandEnvironment(value: string, environment: NodeJS.ProcessEnv = process.env): string {
  const expanded = value.replace(PLACEHOLDER, (_match, name: string) => {
    const replacement = environment[name];
    if (replacement === undefined) throw new Error(`environment variable ${name} is required`);
    return replacement;
  });
  return expanded.replace(ESCAPED_PLACEHOLDER, "$1");
}
