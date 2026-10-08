# AI Operations UI foundations

`@ai-operations/ui` owns the shared semantic tokens, theme bootstrap, accessible primitives, and component states used by the web app.

## Use the system

The web root imports `@ai-operations/ui/tokens.css` and `@ai-operations/ui/components.css` once. Import components from `@ai-operations/ui`:

```tsx
import { Alert, Button, Heading, Stack, Surface, Text } from '@ai-operations/ui';

<Surface>
  <Stack space={4}>
    <Heading level={2}>Operations</Heading>
    <Text tone="secondary">Current run status.</Text>
    <Alert title="Approval needed" tone="warning">
      Review the proposed change.
    </Alert>
    <Button>Review</Button>
  </Stack>
</Surface>;
```

Use semantic color tokens (`--canvas`, `--surface`, `--text-primary`, `--signal`, and the named status tokens) instead of component-specific color values. The default theme is light. `ThemeToggle` persists the selected light or dark theme; the root bootstrap reads that preference before paint and safely falls back to light if storage is unavailable. Mona Sans Variable is the interface face; IBM Plex Mono is for technical identifiers.

Fields associate visible labels, hints, and errors with controls. `Tabs` supports arrow/Home/End navigation, `Dialog` uses the native modal element, and `Menu`/`Popover` use native disclosure behavior. Keep visible names and recovery paths with status colors.

## Showcase and visual proof

The authenticated `/design-system` route shows the token and component inventory with synthetic data. It is a review fixture, not a replacement for application screens.

Run the isolated screenshot and interaction harness with:

```sh
pnpm test:visual:design-system
```

It renders the actual showcase and UI CSS in a standalone local fixture, so it does not start the app’s Supabase stack. It compares snapshots at 1280×800 and 1728×1117 in light and dark themes, then checks keyboard focus and reduced motion. When an intentional visual change is approved, refresh the four baselines with:

```sh
pnpm test:visual:design-system -- --update-snapshots
```

The focused component and contract tests run with `pnpm --filter @ai-operations/ui test`; its type check runs with `pnpm --filter @ai-operations/ui typecheck`.

## Legacy styles

Global `.card` and `.grid` selectors remain for existing screens and are deprecated for new UI. New surfaces should use `Surface` and semantic layout primitives. Migrate old screens as part of their own scoped work rather than changing their page layouts here.
