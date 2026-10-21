'use client';

import React, { cloneElement, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import { Button, Heading } from './primitives';

export function Menu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="ui-menu">
      <summary className="ui-menu__trigger">{label}</summary>
      <div className="ui-menu__content">{children}</div>
    </details>
  );
}

export function Popover({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="ui-popover">
      <summary className="ui-popover__trigger">{label}</summary>
      <div className="ui-popover__content">{children}</div>
    </details>
  );
}

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ 'aria-describedby'?: string | undefined }>;
}) {
  const tooltipId = useId();
  const describedBy = [children.props['aria-describedby'], tooltipId].filter(Boolean).join(' ');
  return (
    <span className="ui-tooltip">
      <span className="ui-tooltip__trigger">
        {cloneElement(children, { 'aria-describedby': describedBy })}
      </span>
      <span className="ui-tooltip__content" id={tooltipId} role="tooltip">
        {label}
      </span>
    </span>
  );
}

export function Dialog({
  open,
  title,
  description,
  onOpenChange,
  children,
  className,
}: {
  open: boolean;
  title: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={['ui-dialog', className].filter(Boolean).join(' ')}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
      ref={dialogRef}
    >
      <header className="ui-dialog__header">
        <div className="ui-dialog__heading">
          <Heading level={3} id={titleId}>
            {title}
          </Heading>
          {description ? (
            <p className="ui-dialog__description" id={descriptionId}>
              {description}
            </p>
          ) : null}
        </div>
        <Button
          aria-label="Close dialog"
          className="ui-dialog__close"
          onClick={() => onOpenChange(false)}
          variant="quiet"
        >
          <span aria-hidden="true">×</span>
        </Button>
      </header>
      <div className="ui-dialog__body">{children}</div>
    </dialog>
  );
}

export function Sheet(props: Parameters<typeof Dialog>[0]) {
  return <Dialog {...props} className={['ui-sheet', props.className].filter(Boolean).join(' ')} />;
}

export type TabItem = {
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
};

export function Tabs({
  items,
  label,
  initialTab,
}: {
  items: TabItem[];
  label: string;
  initialTab?: string;
}) {
  const id = useId();
  const [activeTab, setActiveTab] = useState(
    initialTab && items.some((item) => item.id === initialTab && !item.disabled)
      ? initialTab
      : (items.find((item) => !item.disabled)?.id ?? ''),
  );
  const activeItem = items.find((item) => item.id === activeTab) ?? items[0];

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    if (tabs.length === 0) return;
    const currentIndex = tabs.indexOf(event.target as HTMLButtonElement);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  }

  if (!activeItem) return null;

  return (
    <div className="ui-tabs">
      <div aria-label={label} className="ui-tabs__list" onKeyDown={onTabKeyDown} role="tablist">
        {items.map((item) => (
          <button
            aria-controls={`${id}-panel-${item.id}`}
            aria-selected={activeTab === item.id}
            className="ui-tabs__tab"
            disabled={item.disabled}
            id={`${id}-tab-${item.id}`}
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            role="tab"
            tabIndex={activeTab === item.id ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`${id}-tab-${activeItem.id}`}
        className="ui-tabs__panel"
        id={`${id}-panel-${activeItem.id}`}
        role="tabpanel"
        tabIndex={0}
      >
        {activeItem.content}
      </div>
    </div>
  );
}

export type CommandItem = {
  id: string;
  label: string;
  description?: string;
  group?: string;
  keywords?: string;
};

export function matchesCommand(item: CommandItem, query: string): boolean {
  const searchableTokens = [item.label, item.description, item.group, item.keywords]
    .filter(Boolean)
    .flatMap((field) =>
      field!
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    );
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((term) =>
    searchableTokens.some((token) => {
      if (token.includes(term)) return true;
      let position = 0;
      for (const character of term) {
        position = token.indexOf(character, position);
        if (position === -1) return false;
        position += 1;
      }
      return true;
    }),
  );
}

export function Command({
  label = 'Search commands',
  items,
  emptyMessage = 'No matching commands.',
  onSelect,
  onDismiss,
  autoFocus = false,
}: {
  label?: string;
  items: CommandItem[];
  emptyMessage?: string;
  onSelect: (item: CommandItem) => void;
  onDismiss?: () => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredItems = items.filter((item) => matchesCommand(item, query));
  const selectedIndex = Math.min(activeIndex, Math.max(filteredItems.length - 1, 0));
  const activeItem = filteredItems[selectedIndex];

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (filteredItems.length ? (index + 1) % filteredItems.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(() =>
        filteredItems.length
          ? (selectedIndex - 1 + filteredItems.length) % filteredItems.length
          : 0,
      );
    } else if (event.key === 'Enter' && activeItem) {
      event.preventDefault();
      onSelect(activeItem);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (onDismiss) onDismiss();
      else {
        setQuery('');
        setActiveIndex(0);
      }
    }
  }

  return (
    <div className="ui-command">
      <input
        aria-activedescendant={activeItem ? `${id}-option-${activeItem.id}` : undefined}
        aria-autocomplete="list"
        aria-controls={`${id}-list`}
        aria-expanded="true"
        aria-label={label}
        autoFocus={autoFocus}
        className="ui-input ui-command__input"
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setActiveIndex(0);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        value={query}
      />
      <ul className="ui-command__list" id={`${id}-list`} role="listbox">
        {filteredItems.length ? (
          Object.entries(
            filteredItems.reduce<Record<string, CommandItem[]>>((groups, item) => {
              const group = item.group ?? 'Commands';
              (groups[group] ??= []).push(item);
              return groups;
            }, {}),
          ).map(([group, groupItems]) => (
            <li aria-label={group} className="ui-command__group" key={group} role="group">
              <span className="ui-command__group-label">{group}</span>
              <ul className="ui-command__group-options" role="presentation">
                {groupItems.map((item) => {
                  const index = filteredItems.findIndex((candidate) => candidate.id === item.id);
                  return (
                    <li
                      aria-selected={index === selectedIndex}
                      className="ui-command__option"
                      id={`${id}-option-${item.id}`}
                      key={item.id}
                      onClick={() => onSelect(item)}
                      onMouseMove={() => setActiveIndex(index)}
                      role="option"
                    >
                      <strong>{item.label}</strong>
                      {item.description ? <span>{item.description}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))
        ) : (
          <li className="ui-command__empty" role="presentation">
            {emptyMessage}
          </li>
        )}
      </ul>
    </div>
  );
}
