module.exports = {
  env: {
    browser: true,
    es6: true,
  },
  extends: "eslint:recommended",
  globals: {
    Atomics: "readonly",
    SharedArrayBuffer: "readonly",
    _: "readonly",
    PIXI: "readonly",
    Howler: "readonly",
    Howl: "readonly",
    FontFaceObserver: "readonly",
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
  },
  rules: {
    "no-console": "off",
    "no-unused-vars": ["error", { args: "none" }],
    "@typescript-eslint/no-non-null-assertion": "off",
  },
  ignorePatterns: [".eslintrc.js"],
};
