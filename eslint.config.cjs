const globals = require("globals");
const js = require("@eslint/js");

/**
 * ============================================
 * GLOBAL IGNORES
 * ============================================
 */
module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "**/libs/**",
      "dist/**",
      "release/**",
      "extensionBuilds/**",
      "**/*.zip",
      "**/*.exe",
      "**/*.deb",
      "**/*.rpm",
      "**/*.appImage",
      "**/*.blockmap",
      "**/*.pak",
      "**/*.dat",
      "**/*.bin",
      "**/*.ico",
      "**/*.icns",
      "**/*.png",
      "**/*.svg",
      "**/*.bmp",
      "**/*.map",
    ],
  },

  /**
   * ============================================
   * ESLint Recommended Rules
   * ============================================
   */
  js.configs.recommended,

  /**
   * ============================================
   * NODE / ELECTRON
   * ============================================
   */
  {
    files: ["*.js", "scripts/**/*.js"],
    ignores: ["eslint.config.cjs", "app/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "warn",
      "no-console": "off",
    },
  },

  /**
   * ============================================
   * ELECTRON MAIN
   * ============================================
   */
  {
    files: ["app/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-unused-labels": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "warn",
      "no-console": "off",
    },
  },

  /**
   * ============================================
   * SERVER — Node.js ESM backend
   * ============================================
   */
  {
    files: ["server/*.js", "server/routes/**/*.js", "server/rpc/**/*.js", "server/services/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "warn",
      "no-console": "off",
    },
  },

  /**
   * ============================================
   * SERVER — Browser frontend (public/)
   * ============================================
   */
  {
    files: ["server/public/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "warn",
      "no-console": "off",
    },
  },

  /**
   * ============================================
   * SERVER UTILS
   * ============================================
   */
  {
    files: ["server/utils.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "warn",
      "no-console": "off",
    },
  },

  /**
   * ============================================
   * EXTENSION — background.js
   * ============================================
   */
  {
    files: ["extension/background.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.serviceworker,
      },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "warn",
      "no-control-regex": "off",
      "no-useless-escape": "off",
      "no-prototype-builtins": "off",
      "no-constant-binary-expression": "warn",
    },
  },

  /**
   * ============================================
   * EXTENSION — All other files
   * ============================================
   */
  {
    files: ["extension/**/*.js", "shared/*.js"],
    ignores: ["extension/background.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "warn",
      "no-control-regex": "off",
      "no-useless-escape": "off",
      "no-prototype-builtins": "off",
      "no-constant-binary-expression": "warn",
    },
  },
];
