const globals = require("globals");

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
   * NODE / ELECTRON
   * ============================================
   */
  {
    files: ["*.js", "scripts/**/*.js"],
    ignores: ["eslint.config.cjs"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "warn",
      "no-redeclare": "error",
      "no-fallthrough": "error",
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
      ecmaVersion: 2021,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        updateConfig: "readonly",
      },
    },
    rules: {
      "no-unused-labels": "off",
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
      ecmaVersion: 2021,
      sourceType: "script",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      eqeqeq: "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-redeclare": "error",
      "no-fallthrough": "error",
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
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      eqeqeq: "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "warn",
      "no-redeclare": "error",
      "no-control-regex": "error",
      "no-useless-escape": "error",
      "no-fallthrough": "error",
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
      ecmaVersion: 2022,
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
      globals: {
        window: "readonly",
        document: "readonly",
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
];
