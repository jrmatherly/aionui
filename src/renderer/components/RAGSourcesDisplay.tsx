/**
 * @author Jason Matherly
 * @modified 2026-02-06
 * SPDX-License-Identifier: Apache-2.0
 *
 * RAGSourcesDisplay — Expandable accordion showing Knowledge Base sources
 * used to generate an AI response. Displayed below the agent's message
 * when RAG context was injected.
 */

import { Down, Right } from '@icon-park/react';
import React, { useState } from 'react';

export interface RAGSourceInfo {
  file: string;
  page: number;
  chunkIndex: number;
  score?: number;
  textPreview: string;
}

interface RAGSourcesDisplayProps {
  sources: string[];
  sourceDetails: RAGSourceInfo[];
  tokenEstimate: number;
}

/**
 * Group source details by file for cleaner display
 */
function groupByFile(details: RAGSourceInfo[]): Map<string, RAGSourceInfo[]> {
  const grouped = new Map<string, RAGSourceInfo[]>();
  for (const d of details) {
    const existing = grouped.get(d.file) || [];
    existing.push(d);
    grouped.set(d.file, existing);
  }
  return grouped;
}

const RAGSourcesDisplay: React.FC<RAGSourcesDisplayProps> = ({ sources, sourceDetails, tokenEstimate }) => {
  const [expanded, setExpanded] = useState(false);

  if (!sources || sources.length === 0) return null;

  const grouped = groupByFile(sourceDetails);
  const chunkCount = sourceDetails.length;

  return (
    <div
      className='mt-2 rounded-lg text-xs'
      style={{
        border: '1px solid var(--color-border-2)',
        background: 'var(--color-fill-1)',
      }}
    >
      {/* Clickable header */}
      <button
        className='w-full flex items-center gap-2 px-3 py-2 cursor-pointer'
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-2)',
          fontSize: '12px',
          textAlign: 'left',
        }}
      >
        {expanded ? <Down size={12} /> : <Right size={12} />}
        <span>
          📚 <strong>Sources</strong> — {sources.length} document{sources.length !== 1 ? 's' : ''}, {chunkCount} chunk{chunkCount !== 1 ? 's' : ''} ({tokenEstimate.toLocaleString()} tokens)
        </span>
      </button>

      {/* Expandable detail panel */}
      {expanded && (
        <div className='px-3 pb-3' style={{ borderTop: '1px solid var(--color-border-2)' }}>
          {Array.from(grouped.entries()).map(([fileName, chunks]) => (
            <div key={fileName} className='mt-2'>
              <div className='flex items-center gap-1 mb-1' style={{ color: 'var(--color-text-1)' }}>
                <span>📄</span>
                <strong>{fileName}</strong>
                <span style={{ color: 'var(--color-text-3)' }}>
                  ({chunks.length} chunk{chunks.length !== 1 ? 's' : ''})
                </span>
              </div>
              <div className='flex flex-col gap-1 ml-4'>
                {chunks.map((chunk, i) => (
                  <div
                    key={`${chunk.chunkIndex}-${i}`}
                    className='rounded px-2 py-1'
                    style={{
                      background: 'var(--color-fill-2)',
                      color: 'var(--color-text-2)',
                    }}
                  >
                    <div className='flex items-center gap-2 mb-0.5'>
                      {chunk.page > 0 && (
                        <span className='font-medium' style={{ color: 'var(--color-text-3)' }}>
                          Page {chunk.page}
                        </span>
                      )}
                      {chunk.score !== undefined && <span style={{ color: 'var(--color-text-3)' }}>Score: {(chunk.score * 100).toFixed(1)}%</span>}
                    </div>
                    <div style={{ color: 'var(--color-text-2)', lineHeight: 1.4, fontStyle: 'italic' }}>{chunk.textPreview}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RAGSourcesDisplay;
