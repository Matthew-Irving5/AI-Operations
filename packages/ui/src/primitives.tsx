import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import React from 'react';
import { useId } from 'react';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
type Size = 'sm' | 'md' | 'lg';

function classes(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

export function Text({
  as = 'p',
  size = 'body',
  tone = 'primary',
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'span' | 'p' | 'div';
  size?: 'body' | 'compact' | 'meta';
  tone?: 'primary' | 'secondary' | 'tertiary';
}) {
  const Element = as;
  return (
    <Element
      className={classes('ui-text', `ui-text--${size}`, `ui-text--${tone}`, className)}
      {...props}
    />
  );
}

export function Heading({
  level = 2,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { level?: 1 | 2 | 3 | 4 | 5 | 6 }) {
  const Element = `h${level}` as const;
  return (
    <Element className={classes('ui-heading', `ui-heading--${level}`, className)} {...props} />
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  size?: Size;
}) {
  return (
    <button
      className={classes('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)}
      data-ui="button"
      type={type}
      {...props}
    />
  );
}

export function IconButton({
  label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      {...props}
      aria-label={label}
      className={classes('ui-button', 'ui-button--quiet', 'ui-icon-button', className)}
      data-ui="icon-button"
      type="button"
    >
      {children}
    </button>
  );
}

type FieldChrome = { label: string; hint?: string; error?: string };

function fieldIds(id: string | undefined, prefix: string) {
  const generatedId = useId();
  const controlId = id ?? `${prefix}-${generatedId}`;
  return {
    controlId,
    hintId: `${controlId}-hint`,
    errorId: `${controlId}-error`,
  };
}

function fieldDescription(
  hint: string | undefined,
  error: string | undefined,
  hintId: string,
  errorId: string,
) {
  return (
    [hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(' ') || undefined
  );
}

export function TextField({
  id,
  label,
  hint,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & FieldChrome) {
  const ids = fieldIds(id, 'field');
  const describedBy = fieldDescription(hint, error, ids.hintId, ids.errorId);
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={ids.controlId}>
        {label}
      </label>
      <input
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={classes('ui-input', error && 'ui-input--error', className)}
        id={ids.controlId}
        {...props}
      />
      {hint ? (
        <span className="ui-field__hint" id={ids.hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="ui-field__error" id={ids.errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function TextArea({
  id,
  label,
  hint,
  error,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldChrome) {
  const ids = fieldIds(id, 'textarea');
  const describedBy = fieldDescription(hint, error, ids.hintId, ids.errorId);
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={ids.controlId}>
        {label}
      </label>
      <textarea
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={classes('ui-input', 'ui-textarea', error && 'ui-input--error', className)}
        id={ids.controlId}
        {...props}
      />
      {hint ? (
        <span className="ui-field__hint" id={ids.hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="ui-field__error" id={ids.errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function Status({
  tone = 'neutral',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span className={classes('ui-status', `ui-status--${tone}`, className)} {...props}>
      {children}
    </span>
  );
}

export function Surface({
  as = 'section',
  variant = 'base',
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'article' | 'aside' | 'div';
  variant?: 'base' | 'subtle' | 'raised';
}) {
  const Element = as;
  return (
    <Element className={classes('ui-surface', `ui-surface--${variant}`, className)} {...props} />
  );
}

export function Divider({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={classes('ui-divider', className)} {...props} />;
}

type Spacing = 2 | 3 | 4 | 6 | 8 | 10 | 12 | 16 | 20 | 24 | 32;

export function Stack({
  space = 8,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { space?: Spacing }) {
  return <div className={classes('ui-stack', `ui-space-${space}`, className)} {...props} />;
}

export function Inline({
  space = 4,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { space?: Spacing }) {
  return <div className={classes('ui-inline', `ui-space-${space}`, className)} {...props} />;
}

export function Split({
  aside = '18rem',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { aside?: '14rem' | '18rem' | '22rem' }) {
  return (
    <div
      className={classes('ui-split', `ui-split--${aside.replace('rem', '')}`, className)}
      {...props}
    />
  );
}

export function Alert({
  tone = 'info',
  title,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: Exclude<Tone, 'neutral'>; title?: string }) {
  const urgent = tone === 'danger';
  return (
    <div
      aria-live={urgent ? 'assertive' : 'polite'}
      className={classes('ui-alert', `ui-alert--${tone}`, className)}
      role={urgent ? 'alert' : 'status'}
      {...props}
    >
      {title ? <strong className="ui-alert__title">{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={classes('ui-skeleton', className)} {...props} />;
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="visually-hidden">{children}</span>;
}
