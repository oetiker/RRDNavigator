export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        customElements: "readonly",
        HTMLElement: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        PointerEvent: "readonly",
        MouseEvent: "readonly",
        WheelEvent: "readonly",
        MutationObserver: "readonly",
        CSSStyleSheet: "readonly",
        getComputedStyle: "readonly",
        Number: "readonly",
        Object: "readonly",
        TypeError: "readonly",
        Error: "readonly",
        String: "readonly",
        Array: "readonly",
        process: "readonly",
        Intl: "readonly",
        Map: "readonly",
        Set: "readonly",
        Math: "readonly",
        Date: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        console: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_"
      }],
      "no-undef": "error",
      "prefer-const": "warn"
    }
  }
];
