'use client';

import { useState } from 'react';

type FeedbackFormProps = Readonly<{ reportId: string; categories: string[] }>;

export function FeedbackForm({ reportId, categories }: FeedbackFormProps) {
  const [positive, setPositive] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState('');
  async function submit() {
    if (positive === null) return;
    setStatus('Saving feedback…');
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reportId, positive, categories: selected, comment }),
    });
    setStatus(
      response.ok ? 'Feedback saved to the workflow trace.' : 'Feedback could not be saved.',
    );
  }
  return (
    <section className="feedback" aria-label="Report feedback">
      <div>
        <button type="button" aria-pressed={positive === true} onClick={() => setPositive(true)}>
          Helpful
        </button>
        <button type="button" aria-pressed={positive === false} onClick={() => setPositive(false)}>
          Needs improvement
        </button>
      </div>
      {positive === false ? (
        <fieldset>
          <legend>What needs improvement?</legend>
          {categories.map((category) => (
            <label key={category}>
              <input
                type="checkbox"
                checked={selected.includes(category)}
                onChange={() =>
                  setSelected((current) =>
                    current.includes(category)
                      ? current.filter((item) => item !== category)
                      : [...current, category],
                  )
                }
              />{' '}
              {category}
            </label>
          ))}
        </fieldset>
      ) : null}
      <label>
        Optional feedback
        <textarea
          value={comment}
          maxLength={2000}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      <button type="button" disabled={positive === null} onClick={submit}>
        Submit feedback
      </button>
      <p aria-live="polite">{status}</p>
    </section>
  );
}
