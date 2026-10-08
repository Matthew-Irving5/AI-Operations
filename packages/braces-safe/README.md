# Local braces backport

This package is a transparently named local backport of upstream `braces` 3.0.3. The source files were copied from the npm `braces@3.0.3` package (lockfile integrity: `sha512-yQbXgO/OSZVD2IsiLlro+7Hf6Q18EJrKSEsdoMzKePKXct3gvD8oLcOQdIzGupr5Fj+EDe8gO/lxc1BzfMpxvA==`). Its upstream source tag resolves to commit `74b2db2938fad48a2ea54a9c8bf27a37a62c350d`. The source retains its MIT license. This package is not published as, or represented as, an upstream release.

The local changes reject more than 64 nested braces during iterative parsing, and bound recursive AST traversal in compile, expand, and stringify to 256 nodes. Deep or cyclic ASTs fail with a `RangeError` before JavaScript's call stack is exhausted. The bounds are intentionally fixed and cannot be raised by caller options.

This backport exists only because upstream has no patched release for GHSA-vfj7-8cjw-p6xm. Remove it and the root override when an upstream version fixes the recursive traversal with an equivalent bound. Review and update the regression tests before changing the bound.

The original README is retained as `UPSTREAM-README.md` for API and behavior context.
