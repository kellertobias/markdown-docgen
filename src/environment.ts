const PLACEHOLDER = /(?<!\\)\$\{([A-Z_][A-Z0-9_]*)\}/gu;
const ESCAPED_PLACEHOLDER = /\\(\$\{[A-Z_][A-Z0-9_]*\})/gu;
const ENVIRONMENT_NAME = /^[A-Z_][A-Z0-9_]*$/u;

export function parseAllowedEnvironmentVariables(value: string | undefined): string[] {
  if (value === undefined) return [];
  const names = value.split(",").map((name) => name.trim()).filter(Boolean);
  for (const name of names) {
    if (!ENVIRONMENT_NAME.test(name)) throw new Error(`invalid allowed environment variable name: ${name}`);
  }
  return [...new Set(names)];
}

export function expandEnvironment(value: string, environment: NodeJS.ProcessEnv = process.env, allowedVariables: Iterable<string> = []): string {
  const allowed = new Set(allowedVariables);
  const expanded = value.replace(PLACEHOLDER, (_match, name: string) => {
    if (!allowed.has(name)) return _match;
    const replacement = environment[name];
    if (replacement === undefined) throw new Error(`environment variable ${name} is required`);
    return replacement;
  });
  return expanded.replace(ESCAPED_PLACEHOLDER, "$1");
}
