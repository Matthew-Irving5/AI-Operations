'use client';

import React, { useState } from 'react';
import {
  Alert,
  Button,
  Command,
  Dialog,
  Divider,
  EmptyState,
  ErrorState,
  Heading,
  IconButton,
  Inline,
  LoadingState,
  Menu,
  Popover,
  Sheet,
  Skeleton,
  Split,
  Stack,
  Status,
  Surface,
  Tabs,
  Text,
  TextArea,
  TextField,
  Tooltip,
} from '@ai-operations/ui';

const commandItems = [
  { id: 'review-runs', label: 'Review recent runs', description: 'Open operations history' },
  {
    id: 'open-approvals',
    label: 'Open approvals',
    description: 'See decisions that need attention',
  },
  {
    id: 'view-evidence',
    label: 'View evidence',
    description: 'Inspect the latest execution record',
  },
];

export function DesignSystemShowcase() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState(
    'Choose a command to preview its receipt.',
  );

  return (
    <div className="ui-showcase">
      <header className="ui-showcase__header">
        <div className="ui-showcase__intro">
          <Text as="span" size="meta" tone="secondary">
            Design system / Foundations
          </Text>
          <Heading level={1}>Still surface, active depth</Heading>
          <Text tone="secondary">
            Semantic foundations for the AI Operations control plane. The system stays quiet until a
            state needs attention.
          </Text>
        </div>
        <Inline className="ui-showcase__summary" space={3}>
          <Status tone="success">Light first</Status>
          <Status tone="info">Dark ready</Status>
        </Inline>
      </header>

      <section aria-labelledby="foundation-heading" className="ui-showcase__section">
        <div className="ui-showcase__section-heading">
          <div>
            <Text as="span" size="meta" tone="tertiary">
              01 / Foundations
            </Text>
            <Heading id="foundation-heading" level={2}>
              Hierarchy before containment
            </Heading>
          </div>
          <Text tone="secondary">
            Typography and whitespace lead. Surfaces appear only when they clarify a relationship.
          </Text>
        </div>
        <div className="ui-showcase__grid ui-showcase__grid--three">
          <Surface className="ui-showcase__type-sample">
            <Text as="span" size="meta" tone="tertiary">
              Typography
            </Text>
            <Heading level={3}>Operations at a glance</Heading>
            <Text>Morning review completed with one item waiting for your approval.</Text>
            <Text size="meta" tone="secondary">
              Updated 4 minutes ago
            </Text>
          </Surface>
          <Surface className="ui-showcase__metric">
            <Text as="span" size="meta" tone="secondary">
              Synthetic monthly forecast
            </Text>
            <strong className="ui-showcase__number tabular-nums">£1,248,500.00</strong>
            <Text size="compact" tone="secondary">
              Large values use aligned numerals and remain in context.
            </Text>
          </Surface>
          <Surface className="ui-showcase__technical">
            <Text as="span" size="meta" tone="tertiary">
              Technical reference
            </Text>
            <code className="font-mono">run_8fd2c13e · AAL2 verified</code>
            <Text size="compact" tone="secondary">
              Long identifiers wrap without changing the surrounding layout.
            </Text>
            <code className="font-mono ui-showcase__long-id">
              workflow_execution_20261008_morning_planner_evidence_02
            </code>
          </Surface>
        </div>
      </section>

      <section aria-labelledby="signals-heading" className="ui-showcase__section">
        <div className="ui-showcase__section-heading">
          <div>
            <Text as="span" size="meta" tone="tertiary">
              02 / Signals and states
            </Text>
            <Heading id="signals-heading" level={2}>
              State is always named
            </Heading>
          </div>
          <Text tone="secondary">
            Colour supports the message; it never replaces the state label or recovery path.
          </Text>
        </div>
        <div className="ui-showcase__grid ui-showcase__grid--three">
          <Surface>
            <Stack space={4}>
              <Text as="span" size="meta" tone="tertiary">
                Status
              </Text>
              <Inline space={3}>
                <Status tone="success">Complete</Status>
                <Status tone="warning">Needs approval</Status>
                <Status tone="danger">Sync failed</Status>
              </Inline>
              <Alert title="Waiting for your approval" tone="warning">
                Review the proposed calendar update before it is sent.
              </Alert>
              <Alert title="Provider unavailable" tone="danger">
                The latest sync could not reach Google. Retry is available.
              </Alert>
            </Stack>
          </Surface>
          <Surface>
            <Stack space={4}>
              <Text as="span" size="meta" tone="tertiary">
                Loading and empty
              </Text>
              <LoadingState label="Loading synthetic runs" />
              <Skeleton className="ui-showcase__skeleton" />
              <EmptyState title="No scheduled runs">
                Create a schedule to see its next execution here.
              </EmptyState>
            </Stack>
          </Surface>
          <Surface>
            <Stack space={4}>
              <Text as="span" size="meta" tone="tertiary">
                Error and recovery
              </Text>
              <ErrorState message="The calendar provider did not respond. Existing schedule data is still available." />
              <Button variant="secondary">Retry calendar sync</Button>
            </Stack>
          </Surface>
        </div>
      </section>

      <section aria-labelledby="controls-heading" className="ui-showcase__section">
        <div className="ui-showcase__section-heading">
          <div>
            <Text as="span" size="meta" tone="tertiary">
              03 / Controls
            </Text>
            <Heading id="controls-heading" level={2}>
              Clear action, predictable feedback
            </Heading>
          </div>
          <Text tone="secondary">
            Keyboard focus is visible, control names are explicit, and form errors are linked to
            their fields.
          </Text>
        </div>
        <div className="ui-showcase__grid ui-showcase__grid--two">
          <Surface>
            <Stack space={6}>
              <Text as="span" size="meta" tone="tertiary">
                Buttons and fields
              </Text>
              <Inline space={3}>
                <Button>Review changes</Button>
                <Button variant="secondary">Open evidence</Button>
                <Button variant="quiet">Cancel</Button>
                <Button disabled>Unavailable</Button>
                <IconButton label="Open details">⋯</IconButton>
              </Inline>
              <TextField
                label="Manager name"
                defaultValue="Planner"
                hint="Names remain readable at 200% text spacing."
              />
              <TextField
                label="Approval reference"
                error="Enter a valid reference before continuing."
              />
              <TextArea label="Reason" hint="Explain the proposed change." rows={3} />
            </Stack>
          </Surface>
          <Surface>
            <Stack space={6}>
              <Text as="span" size="meta" tone="tertiary">
                Responsive composition
              </Text>
              <Split>
                <div>
                  <Heading level={3}>Morning plan</Heading>
                  <Text tone="secondary">Three commitments fit today’s available time.</Text>
                </div>
                <Surface as="aside" variant="subtle">
                  <Text size="meta" tone="secondary">
                    Context panel · synthetic
                  </Text>
                </Surface>
              </Split>
              <Divider />
              <Text size="compact" tone="secondary">
                At narrow widths the context region moves below the main content.
              </Text>
            </Stack>
          </Surface>
        </div>
      </section>

      <section aria-labelledby="behavior-heading" className="ui-showcase__section">
        <div className="ui-showcase__section-heading">
          <div>
            <Text as="span" size="meta" tone="tertiary">
              04 / Interaction substrate
            </Text>
            <Heading id="behavior-heading" level={2}>
              Native behavior with clear boundaries
            </Heading>
          </div>
          <Text tone="secondary">
            Use keyboard navigation, Escape, and Tab to inspect the interactive examples.
          </Text>
        </div>
        <div className="ui-showcase__grid ui-showcase__grid--two">
          <Surface>
            <Stack space={6}>
              <Text as="span" size="meta" tone="tertiary">
                Disclosure and overlays
              </Text>
              <Inline space={3}>
                <Menu label="More actions">
                  <Button variant="quiet">Open report</Button>
                  <Button variant="quiet">Copy evidence link</Button>
                </Menu>
                <Popover label="Run context">
                  <Text size="compact">Synthetic run · completed in 1.4 seconds.</Text>
                </Popover>
                <Tooltip label="Opens the latest persisted evidence">
                  <Button variant="secondary">Evidence details</Button>
                </Tooltip>
                <Button onClick={() => setDialogOpen(true)} variant="secondary">
                  Open dialog
                </Button>
                <Button onClick={() => setSheetOpen(true)} variant="secondary">
                  Open sheet
                </Button>
              </Inline>
              <Dialog
                description="The dialog keeps focus within the decision until it is closed."
                onOpenChange={setDialogOpen}
                open={dialogOpen}
                title="Review proposed change"
              >
                <Stack space={4}>
                  <Text>Move the weekly review from 09:00 to 09:30?</Text>
                  <Inline>
                    <Button onClick={() => setDialogOpen(false)}>Confirm change</Button>
                    <Button onClick={() => setDialogOpen(false)} variant="quiet">
                      Keep current time
                    </Button>
                  </Inline>
                </Stack>
              </Dialog>
              <Sheet onOpenChange={setSheetOpen} open={sheetOpen} title="Run evidence">
                <Text>
                  Execution run_8fd2c13e completed. The evidence link opens the persisted trace.
                </Text>
              </Sheet>
            </Stack>
          </Surface>
          <Surface>
            <Stack space={6}>
              <Text as="span" size="meta" tone="tertiary">
                Tabs and command navigation
              </Text>
              <Tabs
                label="Run evidence views"
                items={[
                  {
                    id: 'summary',
                    label: 'Summary',
                    content: <Text>Run completed and the daily plan is current.</Text>,
                  },
                  {
                    id: 'evidence',
                    label: 'Evidence',
                    content: <Text>Two source records and one approval receipt are attached.</Text>,
                  },
                  {
                    id: 'history',
                    label: 'History',
                    content: <Text>Last successful run: 08:12 Europe/London.</Text>,
                  },
                ]}
              />
              <Command
                items={commandItems}
                onSelect={(item) => setSelectedCommand(`Selected: ${item.label}`)}
              />
              <Text aria-live="polite" size="compact" tone="secondary">
                {selectedCommand}
              </Text>
            </Stack>
          </Surface>
        </div>
      </section>

      <footer className="ui-showcase__footer">
        <Text size="meta" tone="tertiary">
          Synthetic content only · no operational records
        </Text>
      </footer>
    </div>
  );
}
