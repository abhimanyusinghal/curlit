import type { RequestConfig, ResponseData, TestResult, ScriptConsoleEntry } from '../types';

// ---------------------------------------------------------------------------
// Pre-request script context — can read & mutate the request before it's sent
// ---------------------------------------------------------------------------
export interface PreRequestContext {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string | null;
  };
  variables: Record<string, string>;
  chain: Record<string, string>;
}

export interface PreRequestResult {
  request: PreRequestContext['request'];
  variables: Record<string, string>;
  chain: Record<string, string>;
  logs: ScriptConsoleEntry[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Post-response (test) script context — read-only request + response, tests
// ---------------------------------------------------------------------------
export interface TestScriptResult {
  tests: TestResult[];
  chain: Record<string, string>;
  logs: ScriptConsoleEntry[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Build a minimal console that captures output
// ---------------------------------------------------------------------------
function createConsoleCapture(): { console: Record<string, (...args: unknown[]) => void>; logs: ScriptConsoleEntry[] } {
  const logs: ScriptConsoleEntry[] = [];
  const makeLogger = (type: ScriptConsoleEntry['type']) => (...args: unknown[]) => {
    logs.push({ type, args: args.map(serialize), timestamp: Date.now() });
  };
  return {
    logs,
    console: {
      log: makeLogger('log'),
      info: makeLogger('info'),
      warn: makeLogger('warn'),
      error: makeLogger('error'),
    },
  };
}

function serialize(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object') {
    try { return JSON.parse(JSON.stringify(val)); } catch { return String(val); }
  }
  return val;
}

// ---------------------------------------------------------------------------
// Expect / assertion helpers injected into test scripts
// ---------------------------------------------------------------------------
function createExpect(value: unknown) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) throw new Error(msg);
  };

  const positiveAssertions = {
    toBe(expected: unknown) {
      assert(value === expected, `Expected ${JSON.stringify(value)} to be ${JSON.stringify(expected)}`);
    },
    toEqual(expected: unknown) {
      assert(
        JSON.stringify(value) === JSON.stringify(expected),
        `Expected ${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`,
      );
    },
    toContain(item: unknown) {
      if (typeof value === 'string') {
        assert(value.includes(String(item)), `Expected "${value}" to contain "${item}"`);
      } else if (Array.isArray(value)) {
        assert(value.includes(item), `Expected array to contain ${JSON.stringify(item)}`);
      } else {
        throw new Error('toContain can only be used on strings or arrays');
      }
    },
    toBeTruthy() {
      assert(!!value, `Expected ${JSON.stringify(value)} to be truthy`);
    },
    toBeFalsy() {
      assert(!value, `Expected ${JSON.stringify(value)} to be falsy`);
    },
    toBeGreaterThan(n: number) {
      assert(Number(value) > n, `Expected ${value} to be greater than ${n}`);
    },
    toBeLessThan(n: number) {
      assert(Number(value) < n, `Expected ${value} to be less than ${n}`);
    },
    toHaveProperty(key: string) {
      assert(
        value !== null && typeof value === 'object' && key in (value as Record<string, unknown>),
        `Expected object to have property "${key}"`,
      );
    },
    toMatch(pattern: RegExp | string) {
      const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
      assert(re.test(String(value)), `Expected "${value}" to match ${re}`);
    },
  };

  return {
    ...positiveAssertions,
    not: {
      toBe(expected: unknown) {
        assert(value !== expected, `Expected ${JSON.stringify(value)} not to be ${JSON.stringify(expected)}`);
      },
      toEqual(expected: unknown) {
        assert(
          JSON.stringify(value) !== JSON.stringify(expected),
          `Expected value not to equal ${JSON.stringify(expected)}`,
        );
      },
      toContain(item: unknown) {
        if (typeof value === 'string') {
          assert(!value.includes(String(item)), `Expected "${value}" not to contain "${item}"`);
        } else if (Array.isArray(value)) {
          assert(!value.includes(item), `Expected array not to contain ${JSON.stringify(item)}`);
        }
      },
      toBeTruthy() {
        assert(!value, `Expected ${JSON.stringify(value)} not to be truthy`);
      },
      toBeFalsy() {
        assert(!!value, `Expected ${JSON.stringify(value)} not to be falsy`);
      },
      toBeGreaterThan(n: number) {
        assert(Number(value) <= n, `Expected ${value} not to be greater than ${n}`);
      },
      toBeLessThan(n: number) {
        assert(Number(value) >= n, `Expected ${value} not to be less than ${n}`);
      },
      toHaveProperty(key: string) {
        assert(
          value === null || typeof value !== 'object' || !(key in (value as Record<string, unknown>)),
          `Expected object not to have property "${key}"`,
        );
      },
      toMatch(pattern: RegExp | string) {
        const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
        assert(!re.test(String(value)), `Expected "${value}" not to match ${re}`);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Static validation — reject scripts that contain async constructs.
//
// The constructor-chain defense is only active during synchronous execution.
// Async code (Promise microtasks, dynamic import, async/await) can outlive
// the synchronous call and access restored constructors. Since pre-request
// and test scripts have no legitimate need for async operations, we reject
// them statically before execution.
// ---------------------------------------------------------------------------
/** Strip string literals, template literals, and comments so keyword checks
 *  don't trigger on `console.log('await')` or `// async note`. */
function stripStringsAndComments(code: string): string {
  return code.replace(
    /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\[\s\S]|[^`\\])*`|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g,
    '',
  );
}

/** Patterns matched against code AFTER strings/comments are removed.
 *  `async` only matches actual keyword positions: before `function`, `(`, `=>`,
 *  or an arrow-param identifier. Property keys like `{async: true}` or
 *  `obj.async` are not matched. */
const ASYNC_PATTERNS: [RegExp, string][] = [
  [/(?<!\.)\bimport\s*\(/, 'Dynamic import() is not allowed in scripts'],
  [/(?<!\.)\basync\s+(?:function\b|\(|[a-zA-Z_$])/, 'Async functions are not allowed in scripts'],
  [/(?<!\.)\bawait\s+/, 'await is not allowed in scripts'],
];

export function validateScript(code: string): string | null {
  const stripped = stripStringsAndComments(code);
  for (const [pattern, message] of ASYNC_PATTERNS) {
    if (pattern.test(stripped)) return message;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Globals shadowed via outer Function parameters (set to undefined).
// `eval` cannot be shadowed as a parameter in strict mode, so it is handled
// separately via a sloppy-mode IIFE wrapper (see below).
// ---------------------------------------------------------------------------
const BLOCKED_GLOBALS = [
  'window', 'self', 'globalThis', 'document',
  'localStorage', 'sessionStorage', 'indexedDB',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'importScripts', 'navigator', 'location', 'history',
  'alert', 'confirm', 'prompt', 'open', 'close',
  'postMessage', 'addEventListener', 'removeEventListener',
  'setTimeout', 'setInterval', 'requestAnimationFrame',
  'Function',
  // Async primitives — defense-in-depth alongside static validation
  'Promise', 'queueMicrotask', 'MutationObserver', 'MessageChannel',
  'requestIdleCallback',
];

// ---------------------------------------------------------------------------
// Run a script string inside a Function sandbox with blocked globals.
//
// Defence layers:
// 1. Static validation rejects async/await/import() before execution
// 2. Parameter-shadow browser APIs (window, fetch, document, Promise, …)
// 3. Sloppy-mode IIFE that shadows `eval` as a parameter → blocks
//    indirect-eval escape `(0, eval)("this")`
// 4. Temporarily neuter Function.prototype.constructor (and async/generator
//    variants) → blocks `(() => {}).constructor("return globalThis")()`
// 5. User code runs in strict mode inside the inner IIFE.
// ---------------------------------------------------------------------------
const FunctionProto = Object.getPrototypeOf(function () {});
const origAsyncProto = Object.getPrototypeOf(async function () {});
const origGenProto = Object.getPrototypeOf(function* () {});
const origAsyncGenProto = Object.getPrototypeOf(async function* () {});

function runSandboxed(code: string, globals: Record<string, unknown>): void {
  // Static validation — reject async constructs before execution
  const validationError = validateScript(code);
  if (validationError) throw new Error(validationError);

  // Merge allowed globals + blocked names (blocked ones get undefined value)
  const allNames = [...BLOCKED_GLOBALS];
  const allValues: unknown[] = BLOCKED_GLOBALS.map(() => undefined);

  for (const [name, value] of Object.entries(globals)) {
    const idx = allNames.indexOf(name);
    if (idx >= 0) {
      allValues[idx] = value;
    } else {
      allNames.push(name);
      allValues.push(value);
    }
  }

  // Wrap user code:
  //   - Outer sloppy IIFE shadows `eval` (cannot be a param name in strict mode)
  //   - Inner strict IIFE runs the actual user code
  // The __$nil parameter receives `undefined` and is forwarded to shadow `eval`.
  allNames.push('__$nil');
  allValues.push(undefined);
  const wrapped =
    '(function(eval){' +
      '(function(){"use strict";\n' + code + '\n})();' +
    '})(__$nil);';

  const fn = new Function(...allNames, wrapped);

  // Block constructor-chain escape: temporarily replace .constructor on
  // Function / AsyncFunction / GeneratorFunction / AsyncGeneratorFunction
  // prototypes with a throwing stub.
  const origCtor = FunctionProto.constructor;
  const origAsyncCtor = origAsyncProto.constructor;
  const origGenCtor = origGenProto.constructor;
  const origAsyncGenCtor = origAsyncGenProto.constructor;
  const throwing = function () { throw new Error('Function constructor is not allowed in scripts'); };
  const neuter = (proto: object) =>
    Object.defineProperty(proto, 'constructor', { value: throwing, configurable: true, writable: false });
  const restore = (proto: object, orig: unknown) =>
    Object.defineProperty(proto, 'constructor', { value: orig, configurable: true, writable: true });

  neuter(FunctionProto);
  neuter(origAsyncProto);
  neuter(origGenProto);
  neuter(origAsyncGenProto);

  try {
    fn(...allValues);
  } finally {
    restore(FunctionProto, origCtor);
    restore(origAsyncProto, origAsyncCtor);
    restore(origGenProto, origGenCtor);
    restore(origAsyncGenProto, origAsyncGenCtor);
  }
}

// ---------------------------------------------------------------------------
// Execute pre-request script
// ---------------------------------------------------------------------------
export function runPreRequestScript(
  script: string,
  request: RequestConfig,
  resolvedHeaders: Record<string, string>,
  resolvedBody: string | null,
  variables: Record<string, string>,
  chainVars: Record<string, string>,
): PreRequestResult {
  const { console: fakeConsole, logs } = createConsoleCapture();

  const ctx: PreRequestContext = {
    request: {
      method: request.method,
      url: request.url,
      headers: { ...resolvedHeaders },
      body: resolvedBody,
    },
    variables: { ...variables },
    chain: { ...chainVars },
  };

  try {
    runSandboxed(script, {
      curlit: ctx,
      console: fakeConsole,
      expect: createExpect,
    });
    return { request: ctx.request, variables: ctx.variables, chain: ctx.chain, logs };
  } catch (err) {
    return {
      request: ctx.request,
      variables: ctx.variables,
      chain: ctx.chain,
      logs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Execute post-response (test) script
// ---------------------------------------------------------------------------
export function runTestScript(
  script: string,
  request: RequestConfig,
  response: ResponseData,
  chainVars: Record<string, string>,
): TestScriptResult {
  const { console: fakeConsole, logs } = createConsoleCapture();
  const tests: TestResult[] = [];
  const chain = { ...chainVars };

  // Parse response body as JSON if possible
  let jsonBody: unknown = undefined;
  try {
    jsonBody = JSON.parse(response.body);
  } catch {
    // not JSON
  }

  const testFn = (name: string, fn: () => void) => {
    try {
      fn();
      tests.push({ name, passed: true });
    } catch (err) {
      tests.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  const responseObj = {
    status: response.status,
    statusText: response.statusText,
    headers: { ...response.headers },
    body: response.body,
    json: jsonBody,
    time: response.time,
    size: response.size,
    cookies: response.cookies,
  };

  try {
    runSandboxed(script, {
      curlit: {
        response: responseObj,
        request: {
          method: request.method,
          url: request.url,
        },
        chain,
        test: testFn,
      },
      response: responseObj,
      test: testFn,
      expect: createExpect,
      console: fakeConsole,
    });
    return { tests, chain, logs };
  } catch (err) {
    return {
      tests,
      chain,
      logs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
