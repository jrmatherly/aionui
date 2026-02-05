/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTextSelection } from '@/renderer/hooks/useTextSelection';
import { extractContentFromDiff } from '@/renderer/utils/diffUtils';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import remarkGfm from 'remark-gfm';
import type { PreviewMetadata } from '../../context/PreviewContext';
import SelectionToolbar from '../renderers/SelectionToolbar';

interface DiffPreviewProps {
  content: string; // Diff content
  metadata?: PreviewMetadata; // Metadata
  onClose?: () => void; // Close callback
  hideToolbar?: boolean; // Hide toolbar
  viewMode?: 'source' | 'preview'; // External view mode
  onViewModeChange?: (mode: 'source' | 'preview') => void; // View mode change callback
}

/**
 * Diff preview component
 *
 * Uses ReactMarkdown to render Diff, supports source/preview toggle and download
 */
const DiffPreview: React.FC<DiffPreviewProps> = ({ content, metadata, onClose, hideToolbar = false, viewMode: externalViewMode, onViewModeChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });
  const [internalViewMode, setInternalViewMode] = useState<'source' | 'preview'>('preview'); // Internal view mode

  // Use external viewMode if provided, otherwise use internal state
  const viewMode = externalViewMode !== undefined ? externalViewMode : internalViewMode;

  // Monitor theme changes
  useEffect(() => {
    const updateTheme = () => {
      const theme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
      setCurrentTheme(theme);
    };

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  // Monitor text selection
  const { selectedText, selectionPosition, clearSelection } = useTextSelection(containerRef);

  // Download Diff file
  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diff-${Date.now()}.diff`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Toggle view mode
  const handleViewModeChange = (mode: 'source' | 'preview') => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  // Extract clean file content
  const cleanContent = extractContentFromDiff(content);

  // Check if extracted content is markdown
  const isMarkdownContent = metadata?.title?.toLowerCase().endsWith('.md') || metadata?.title?.toLowerCase().endsWith('.markdown');

  return (
    <div className='flex flex-col w-full h-full overflow-hidden'>
      {/* Toolbar: Source/Preview toggle + Download button */}
      {!hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 flex-shrink-0'>
          <div className='flex items-center gap-4px'>
            {/* Source button */}
            <div className={`px-12px py-4px rd-4px cursor-pointer transition-colors text-12px ${viewMode === 'source' ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`} onClick={() => handleViewModeChange('source')}>
              {'Source'}
            </div>
            {/* Preview button */}
            <div className={`px-12px py-4px rd-4px cursor-pointer transition-colors text-12px ${viewMode === 'preview' ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`} onClick={() => handleViewModeChange('preview')}>
              {'Preview'}
            </div>
          </div>

          {/* Right button group: Download + Close */}
          <div className='flex items-center gap-8px'>
            {/* Download button */}
            <div className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors' onClick={handleDownload} title={'Download Diff file'}>
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' className='text-t-secondary'>
                <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
                <polyline points='7 10 12 15 17 10' />
                <line x1='12' y1='15' x2='12' y2='3' />
              </svg>
              <span className='text-12px text-t-secondary'>{'Download'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Content area */}
      <div ref={containerRef} className='flex-1 overflow-auto p-16px'>
        {viewMode === 'source' ? (
          // Source mode: Show extracted clean file content
          <pre className='w-full m-0 p-12px bg-bg-2 rd-8px overflow-auto font-mono text-12px text-t-primary whitespace-pre-wrap break-words'>{cleanContent}</pre>
        ) : // Preview mode: Render content based on file type
        isMarkdownContent ? (
          // Markdown file: Render markdown
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                const codeContent = String(children).replace(/\n$/, '');

                // Check if it's inline code
                if (!String(children).includes('\n')) {
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }

                return (
                  <div className='my-4'>
                    <SyntaxHighlighter style={currentTheme === 'dark' ? vs2015 : vs} language={match ? match[1] : 'text'} PreTag='div'>
                      {codeContent}
                    </SyntaxHighlighter>
                  </div>
                );
              },
            }}
          >
            {cleanContent}
          </ReactMarkdown>
        ) : (
          // Other files: Show syntax-highlighted code
          <SyntaxHighlighter style={currentTheme === 'dark' ? vs2015 : vs} language='text' PreTag='div' showLineNumbers>
            {cleanContent}
          </SyntaxHighlighter>
        )}
      </div>

      {/* Text selection floating toolbar */}
      {selectedText && <SelectionToolbar selectedText={selectedText} position={selectionPosition} onClear={clearSelection} />}
    </div>
  );
};

export default DiffPreview;
