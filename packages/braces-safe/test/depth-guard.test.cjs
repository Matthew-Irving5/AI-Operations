'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const braces = require('../index');

const deeplyNestedPattern = (depth) => `${'{'.repeat(depth)}a${'}'.repeat(depth)}`;

test('parsing accepts the supported nesting boundary and rejects the next brace', () => {
  assert.doesNotThrow(() => braces.parse(deeplyNestedPattern(64)));
  assert.throws(() => braces.parse(deeplyNestedPattern(65)), {
    name: 'RangeError',
    message: /maximum supported depth \(64\)/,
  });
});

test('compile, expand, and stringify reject excessively deep ASTs before stack exhaustion', () => {
  const makeDeepAst = (depth) => {
    const root = { type: 'root', nodes: [] };
    let parent = root;
    for (let index = 0; index < depth; index++) {
      const child = { type: 'paren', nodes: [], parent };
      parent.nodes.push(child);
      parent = child;
    }
    parent.nodes.push({ type: 'text', value: 'a', parent });
    return root;
  };
  const ast = makeDeepAst(300);
  const error = { name: 'RangeError', message: /maximum supported depth \(256\)/ };

  assert.throws(() => braces.compile(ast), error);
  assert.throws(() => braces.expand(ast), error);
  assert.throws(() => braces.stringify(ast), error);
});

test('compile, expand, and stringify reject cyclic ASTs deterministically', () => {
  const ast = { type: 'root', nodes: [] };
  ast.nodes.push(ast);
  const error = { name: 'RangeError', message: /maximum supported depth \(256\)/ };

  assert.throws(() => braces.compile(ast), error);
  assert.throws(() => braces.expand(ast), error);
  assert.throws(() => braces.stringify(ast), error);
});

test('expansion bounds cyclic parent pointers before walking the AST', () => {
  const root = { type: 'root', nodes: [] };
  const parent = { type: 'paren', nodes: [], parent: null };
  const child = { type: 'paren', nodes: [], parent };
  parent.parent = parent;
  parent.nodes.push(child);
  root.nodes.push(parent);
  const error = { name: 'RangeError', message: /maximum supported depth \(256\)/ };

  assert.throws(() => braces.expand(root), error);
});

test('expansion bounds cyclic AST node parent pointers', () => {
  const root = { type: 'root', nodes: [] };
  const child = { type: 'paren', nodes: [], parent: null };
  child.parent = child;
  root.nodes.push(child);
  const error = { name: 'RangeError', message: /maximum supported depth \(256\)/ };

  assert.throws(() => braces.expand(root), error);
});

test('public compile and expansion reject deeply nested patterns during parsing', () => {
  assert.throws(() => braces(deeplyNestedPattern(80)), {
    name: 'RangeError',
    message: /maximum supported depth \(64\)/,
  });
  assert.throws(() => braces.expand(deeplyNestedPattern(80)), /maximum supported depth \(64\)/);
});

test('ordinary brace compilation and expansion retain upstream behavior', () => {
  assert.deepEqual(braces('file-{a,b}.txt'), ['file-(a|b).txt']);
  assert.deepEqual(braces('file-{a,b}.txt', { expand: true }), ['file-a.txt', 'file-b.txt']);
});
