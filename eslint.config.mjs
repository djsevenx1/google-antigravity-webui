import js from "@eslint/js";

export default [
  {
    ignores: ["node_modules/**", "public/**", "data/**", "home/**", "bin/**", "scratch/**", "**/*.bak.*"]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly", console: "readonly", Buffer: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly",
        setInterval: "readonly", clearInterval: "readonly",
        fetch: "readonly", URL: "readonly", URLSearchParams: "readonly",
        AbortSignal: "readonly", AbortController: "readonly",
        WebSocket: "readonly", globalThis: "readonly",
        localStorage: "readonly", document: "readonly", window: "readonly",
        navigator: "readonly", location: "readonly", HTMLElement: "readonly",
        Headers: "readonly", File: "readonly", FormData: "readonly", Blob: "readonly",
        ReadableStream: "readonly", WritableStream: "readonly",
        Request: "readonly", Response: "readonly", EventSource: "readonly",
        performance: "readonly", crypto: "readonly", atob: "readonly", btoa: "readonly",
        structuredClone: "readonly", queueMicrotask: "readonly",
        setImmediate: "readonly", clearImmediate: "readonly",
        require: "readonly", module: "readonly", exports: "readonly",
        __dirname: "readonly", __filename: "readonly", global: "readonly"
      }
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "warn",
      "no-redeclare": "warn",
      "no-unreachable": "warn",
      "no-constant-condition": "warn",
      "no-empty": "warn",
      "no-debugger": "warn",
      "no-dupe-keys": "warn",
      "no-invalid-regexp": "warn",
      "no-irregular-whitespace": "warn",
      "no-sparse-arrays": "warn",
      "no-useless-escape": "warn",
      "no-control-regex": "off",
      "no-useless-assignment": "off",
      "eqeqeq": "warn",
      "prefer-const": "warn",
      "no-var": "warn"
    }
  }
];
