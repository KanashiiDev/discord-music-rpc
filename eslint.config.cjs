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
    ignores: ["eslint.config.cjs"],
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
    files: ["main.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        updateConfig: "readonly",
      },
    },
    rules: {
      "no-unused-labels": "off",
      "no-console": "off",
    },
  },

  /**
   * ============================================
   * PUBLIC
   * ============================================
   */
  {
    files: ["public/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: globals.browser,
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "prefer-const": "warn",
    },
  },

  /**
   * ============================================
   * EXTENSION SOURCE
   * ============================================
   */
  {
    files: ["extension/**/*.js"],
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
   * EXTENSION BACKGROUND
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
      },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "prefer-const": "warn",
    },
  },

  /**
   * ============================================
   * MIXED UTILS
   * ============================================
   */
  {
    files: ["utils.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "off",
      "no-control-regex": "off",
      "no-useless-escape": "off",
    },
  },
];
