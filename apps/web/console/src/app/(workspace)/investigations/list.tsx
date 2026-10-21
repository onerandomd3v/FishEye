'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { investigationFixtures } from '../fixtures';

export function InvestigationList() {
  const [query, setQuery] = useState('');
  const [context, setContext] = useState('all');
  const rows = useMemo(
    () =>
      investigationFixtures.filter((item) => {
        const matchesQuery =
          `${item.id} ${item.description} ${item.signals.join(' ')}`
            .toLowerCase()
            .includes(query.toLowerCase());
        const matchesContext = context === 'all' || item.id === context;
        return matchesQuery && matchesContext;
      }),
    [query, context],
  );

  return (
    <section
      className="card section-card"
      aria-labelledby="investigations-table-title"
    >
      <div className="section-title-row">
        <h2 id="investigations-table-title">Synthetic example accounts</h2>
        <span className="section-count">{rows.length} shown</span>
      </div>
      <div className="filters">
        <div className="field search-field">
          <label htmlFor="investigation-search">Search examples</label>
          <input
            id="investigation-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search account or signal"
          />
        </div>
        <div className="field">
          <label htmlFor="example-filter">Example account</label>
          <select
            id="example-filter"
            value={context}
            onChange={(event) => setContext(event.target.value)}
          >
            <option value="all">All examples</option>
            {investigationFixtures.map((item) => (
              <option value={item.id} key={item.id}>
                {item.id}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <caption className="visually-hidden">
            Synthetic examples for the investigation experience, not detector
            findings.
          </caption>
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Context example</th>
              <th scope="col">Signals in example</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link href={`/investigations/${item.id}`}>{item.id}</Link>
                </td>
                <td>{item.description}</td>
                <td>{item.signals.join(', ')}</td>
                <td>
                  <span className="fixture-tag">Fixture only</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="below-table-note" role="status">
          No examples match. Change the search or select all examples.
        </p>
      )}
      <p className="below-table-note">
        These examples are local development fixtures. They are not returned by
        an API and have no calculated risk score.
      </p>
    </section>
  );
}
