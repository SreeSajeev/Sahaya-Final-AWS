# FORMULA ENGINE

## Guarantee

**No `eval`, no `Function`, no `vm`, no arbitrary JavaScript.**

Pipeline:

```
tokenize → parse (AST) → validateAst → interpret
```

Optional: `constantFold`, `detectFormulaCycles`, `applyCalculatedFields`.

## Supported

Operators: `+ - * / % () == != < > <= >= && || !`  
Functions: `IF SUM COUNT AVG MIN MAX ABS ROUND DATEADD DATEDIFF NOW CONCAT LEN LOWER UPPER TRIM`  
Refs: `{{field}}`, bare `field`, `parent.*`, `row.*`

## Blocked

`constructor`, `Function`, `process`, `globalThis`, `require`, `import`, `__proto__`, etc.

## Evidence

Prior escape `([]).constructor.constructor("return 1+1")()` → **rejected**.  
Unit coverage: `tests/unit/formulaEngineAst.test.js` (100+ cases).
