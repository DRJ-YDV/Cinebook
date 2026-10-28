const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");

// Execute the actual application TypeScript. Only named boundaries are mocked;
// handler, validator and repository logic are never copied into the tests.
function sourceLoader(overrides = {}, options = {}) {
  const cache = new Map();
  const env = {
    NODE_ENV: "test",
    SESSION_SECRET: "isolated-test-session-secret-32-characters",
    ...options.env,
  };
  const context = vm.createContext({
    console: options.console ?? console,
    Buffer,
    Error,
    TypeError,
    RangeError,
    Date: options.Date ?? Date,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    Response,
    Request,
    Headers,
    crypto: crypto.webcrypto,
    btoa,
    atob,
    setTimeout,
    clearTimeout,
    process: { env, platform: process.platform, version: process.version },
    fetch:
      options.fetch ??
      (() => {
        throw new Error("Network access is disabled in isolated tests");
      }),
  });

  function resolveSource(id, parent = path.join(root, "entry.cjs")) {
    const candidate = id.startsWith("@/")
      ? path.join(root, "src", id.slice(2))
      : path.isAbsolute(id)
        ? id
        : path.resolve(path.dirname(parent), id);
    for (const suffix of ["", ".ts", ".tsx", ".js", "/index.ts"]) {
      const file = candidate + suffix;
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    }
    throw new Error(`Cannot resolve source module ${id}`);
  }

  function load(id, parent) {
    if (Object.hasOwn(overrides, id)) return overrides[id];
    if (!id.startsWith(".") && !id.startsWith("@/") && !path.isAbsolute(id)) {
      if (id === "mongodb") throw new Error("Live MongoDB is disabled in isolated tests");
      return require(id);
    }
    const file = resolveSource(id, parent);
    const relative = path.relative(root, file).replaceAll("\\", "/");
    if (Object.hasOwn(overrides, relative)) return overrides[relative];
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: file,
    }).outputText;
    const wrapper = new vm.Script(
      `(function(require,module,exports,__filename,__dirname){\n${compiled}\n})`,
      { filename: file },
    ).runInContext(context);
    wrapper(
      (dependency) => load(dependency, file),
      module,
      module.exports,
      file,
      path.dirname(file),
    );
    return module.exports;
  }

  return { load: (file) => load(path.resolve(root, file)), env };
}

function serverFunctionFramework() {
  return {
    createServerFn(config) {
      let validator;
      const builder = {
        validator(value) {
          validator = value;
          return builder;
        },
        inputValidator(value) {
          validator = value;
          return builder;
        },
        handler(handler) {
          const invoke = async (input = {}) => {
            let data = input.data;
            if (validator) {
              if (typeof validator === "function") data = await validator(data);
              else if (typeof validator.parse === "function") data = validator.parse(data);
              else if (validator["~standard"]?.validate) {
                const result = await validator["~standard"].validate(data);
                if (result.issues) throw new Error("VALIDATION: Invalid input.");
                data = result.value;
              } else throw new Error("Unsupported test validator boundary");
            }
            return handler({ data, context: {} });
          };
          invoke.method = config.method;
          return invoke;
        },
      };
      return builder;
    },
  };
}

module.exports = { sourceLoader, serverFunctionFramework, root };
