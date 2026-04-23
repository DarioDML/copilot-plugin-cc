/**
 * Argument parsing utilities for the copilot-companion CLI.
 */

/**
 * Split a raw argument string into an array, respecting quoted substrings.
 */
export function splitRawArgumentString(raw) {
  const args = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (const ch of raw) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (/\s/.test(ch) && !inSingle && !inDouble) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) {
    args.push(current);
  }
  return args;
}

/**
 * Parse an argv array into { options, positionals }.
 *
 * @param {string[]} argv
 * @param {object} config
 * @param {string[]} [config.booleanOptions] — flags that take no value
 * @param {string[]} [config.valueOptions]   — flags that consume the next token
 * @param {object}   [config.aliasMap]       — short → long mappings
 */
export function parseArgs(argv, config = {}) {
  const booleans = new Set(config.booleanOptions ?? []);
  const values = new Set(config.valueOptions ?? []);
  const aliases = config.aliasMap ?? {};
  const options = {};
  const positionals = [];

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      if (booleans.has(key)) {
        options[key] = true;
      } else if (values.has(key) && i + 1 < argv.length) {
        options[key] = argv[++i];
      } else {
        options[key] = true;
      }
    } else if (token.startsWith("-") && token.length === 2) {
      const short = token.slice(1);
      const long = aliases[short] ?? short;
      if (booleans.has(long)) {
        options[long] = true;
      } else if (values.has(long) && i + 1 < argv.length) {
        options[long] = argv[++i];
      } else {
        options[long] = true;
      }
    } else {
      positionals.push(token);
    }
    i++;
  }

  return { options, positionals };
}
