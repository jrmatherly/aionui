/**
 * @author Jason Matherly
 * @modified 2026-02-06
 * SPDX-License-Identifier: Apache-2.0
 *
 * User settings page for Knowledge Base management.
 * Allows users to view and manage their per-user LanceDB knowledge base.
 */

import { createLogger } from '@/renderer/utils/logger';
import { withCsrfToken } from '@/webserver/middleware/csrfClient';
import { Button, Card, Empty, Input, Message, Modal, Space, Spin, Table, Tag, Tooltip, Typography } from '@arco-design/web-react';
import type { ColumnProps } from '@arco-design/web-react/es/Table';
import { DataAll, Delete, History, Refresh, Search, Tool } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const log = createLogger('KnowledgeBase');

interface KnowledgeStatus {
  initialized: boolean;
  path?: string;
  size_bytes?: number;
  size_mb?: number;
  tables?: string[];
  knowledge?: {
    version: number;
    row_count: number;
    unique_sources?: number;
    sources?: Array<{ file: string; chunks: number }>;
  };
}

interface Document {
  id: string;
  text: string;
  source_file: string;
  page: number;
  chunk_index: number;
  created_at: string;
}

interface SearchResult {
  id: string;
  text: string;
  source_file: string;
  page: number;
  chunk_index: number;
  score?: number;
}

interface Version {
  version: number;
  timestamp?: string;
}

const KnowledgeBase: React.FC = () => {
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [_documents, setDocuments] = useState<Document[]>([]);
  const [sources, setSources] = useState<Array<{ file: string; chunks: number }>>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'hybrid' | 'vector' | 'fts'>('hybrid');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Version history
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionsVisible, setVersionsVisible] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoadingStatus(true);
      const response = await fetch('/api/knowledge/status', { credentials: 'include' });
      const data = await response.json();
      if (data.success && data.status) {
        setStatus(data.status);
        if (data.status.knowledge?.sources) {
          setSources(data.status.knowledge.sources);
        }
      } else {
        log.warn({ error: data.error }, 'Failed to fetch knowledge status');
      }
    } catch (error) {
      log.error({ err: error }, 'Failed to fetch knowledge status');
      Message.error('Failed to fetch knowledge base status');
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoadingDocs(true);
      const response = await fetch('/api/knowledge/documents?limit=100', { credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        setDocuments(data.documents || []);
        if (data.sources) {
          setSources(data.sources);
        }
      } else {
        log.warn({ error: data.error }, 'Failed to fetch documents');
      }
    } catch (error) {
      log.error({ err: error }, 'Failed to fetch documents');
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Message.warning('Please enter a search query');
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/knowledge/search?q=${encodeURIComponent(searchQuery)}&type=${searchType}&limit=10`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setSearchResults(data.results || []);
        if (data.results?.length === 0) {
          Message.info('No results found');
        }
      } else {
        Message.error(data.error || 'Search failed');
      }
    } catch (error) {
      log.error({ err: error }, 'Search failed');
      Message.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleDeleteSource = async (sourceFile: string) => {
    Modal.confirm({
      title: 'Delete Document',
      content: `Are you sure you want to delete all chunks from "${sourceFile}"? This action cannot be undone.`,
      okButtonProps: { status: 'danger' },
      okText: 'Delete',
      onOk: async () => {
        try {
          const response = await fetch(`/api/knowledge/document/${encodeURIComponent(sourceFile)}`, {
            method: 'DELETE',
            credentials: 'include',
          });
          const data = await response.json();
          if (data.success) {
            Message.success(`Deleted ${data.deleted_chunks || 0} chunks from ${sourceFile}`);
            await Promise.all([fetchStatus(), fetchDocuments()]);
          } else {
            Message.error(data.error || 'Failed to delete document');
          }
        } catch (error) {
          log.error({ err: error }, 'Failed to delete document');
          Message.error('Failed to delete document');
        }
      },
    });
  };

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const response = await fetch('/api/knowledge/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(withCsrfToken({})),
      });
      const data = await response.json();
      if (data.success) {
        Message.success('Knowledge base reindexed successfully');
        await fetchStatus();
      } else {
        Message.error(data.error || 'Reindex failed');
      }
    } catch (error) {
      log.error({ err: error }, 'Reindex failed');
      Message.error('Reindex failed');
    } finally {
      setReindexing(false);
    }
  };

  const handleClear = () => {
    Modal.confirm({
      title: 'Clear Knowledge Base',
      icon: null,
      content: (
        <div style={{ padding: '8px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '16px',
              background: 'var(--color-fill-2)',
              borderRadius: '8px',
              border: '1px solid var(--color-border-2)',
            }}
          >
            <Delete style={{ fontSize: '24px', color: 'rgb(var(--danger-6))', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <Typography.Text style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>This will delete ALL indexed documents and embeddings.</Typography.Text>
              <Typography.Text type='secondary' style={{ fontSize: '13px' }}>
                Your original files are not affected. You can re-ingest documents at any time.
              </Typography.Text>
            </div>
          </div>
        </div>
      ),
      okButtonProps: { status: 'danger' },
      okText: 'Clear All Data',
      onOk: async () => {
        setClearing(true);
        try {
          const response = await fetch('/api/knowledge/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(withCsrfToken({ confirm: true })),
          });
          const data = await response.json();
          if (data.success) {
            Message.success('Knowledge base cleared');
            await Promise.all([fetchStatus(), fetchDocuments()]);
            setSearchResults([]);
          } else {
            Message.error(data.error || 'Failed to clear knowledge base');
          }
        } catch (error) {
          log.error({ err: error }, 'Failed to clear knowledge base');
          Message.error('Failed to clear knowledge base');
        } finally {
          setClearing(false);
        }
      },
    });
  };

  const fetchVersions = async () => {
    setLoadingVersions(true);
    try {
      const response = await fetch('/api/knowledge/versions', { credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        setVersions(data.versions || []);
      } else {
        Message.error(data.error || 'Failed to fetch versions');
      }
    } catch (error) {
      log.error({ err: error }, 'Failed to fetch versions');
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleShowVersions = async () => {
    setVersionsVisible(true);
    await fetchVersions();
  };

  const handleRestore = async (version: number) => {
    Modal.confirm({
      title: 'Restore Version',
      content: `Restore knowledge base to version ${version}? This will create a new version from the historical state.`,
      okText: 'Restore',
      onOk: async () => {
        try {
          const response = await fetch('/api/knowledge/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(withCsrfToken({ version })),
          });
          const data = await response.json();
          if (data.success) {
            Message.success(`Restored to version ${version}`);
            setVersionsVisible(false);
            await Promise.all([fetchStatus(), fetchDocuments()]);
          } else {
            Message.error(data.error || 'Restore failed');
          }
        } catch (error) {
          log.error({ err: error }, 'Restore failed');
          Message.error('Restore failed');
        }
      },
    });
  };

  useEffect(() => {
    void Promise.all([fetchStatus(), fetchDocuments()]);
  }, [fetchStatus, fetchDocuments]);

  const sourceColumns: ColumnProps<{ file: string; chunks: number }>[] = [
    {
      title: 'Source File',
      dataIndex: 'file',
      sorter: (a, b) => a.file.localeCompare(b.file),
      render: (file: string) => (
        <Tooltip content={file}>
          <Typography.Text ellipsis style={{ maxWidth: '300px' }}>
            {file}
          </Typography.Text>
        </Tooltip>
      ),
    },
    {
      title: 'Chunks',
      dataIndex: 'chunks',
      width: 100,
      sorter: (a, b) => a.chunks - b.chunks,
    },
    {
      title: 'Actions',
      width: 100,
      render: (_: unknown, record: { file: string }) => (
        <Button icon={<Delete />} type='text' status='danger' size='small' onClick={() => handleDeleteSource(record.file)}>
          Delete
        </Button>
      ),
    },
  ];

  const searchResultColumns: ColumnProps<SearchResult>[] = [
    {
      title: 'Text',
      dataIndex: 'text',
      render: (text: string) => (
        <Typography.Text ellipsis={{ rows: 2 }} style={{ maxWidth: '400px' }}>
          {text}
        </Typography.Text>
      ),
    },
    {
      title: 'Source',
      dataIndex: 'source_file',
      width: 200,
      render: (file: string) => (
        <Typography.Text ellipsis style={{ maxWidth: '180px' }}>
          {file}
        </Typography.Text>
      ),
    },
    {
      title: 'Score',
      dataIndex: 'score',
      width: 80,
      render: (score?: number) => (score !== undefined ? score.toFixed(3) : '-'),
    },
  ];

  const versionColumns: ColumnProps<Version>[] = [
    {
      title: 'Version',
      dataIndex: 'version',
      width: 100,
    },
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      render: (ts?: string) => (ts ? new Date(ts).toLocaleString() : '-'),
    },
    {
      title: 'Actions',
      width: 100,
      render: (_: unknown, record: Version) => (
        <Button type='text' size='small' onClick={() => handleRestore(record.version)}>
          Restore
        </Button>
      ),
    },
  ];

  const renderStatusCard = () => {
    if (loadingStatus) {
      return (
        <Card title='Knowledge Base Status' style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
            <Spin />
          </div>
        </Card>
      );
    }

    const hasKnowledge = status?.initialized && status?.knowledge;

    return (
      <Card
        title='Knowledge Base Status'
        style={{ marginBottom: '16px' }}
        extra={
          <Button icon={<Refresh />} onClick={() => void fetchStatus()} loading={loadingStatus} type='text' size='small'>
            Refresh
          </Button>
        }
      >
        <Space direction='vertical' style={{ width: '100%' }}>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div>
              <Typography.Text type='secondary'>Documents</Typography.Text>
              <div>
                <Tag color={hasKnowledge ? 'arcoblue' : 'gray'}>{status?.knowledge?.unique_sources || 0}</Tag>
              </div>
            </div>
            <div>
              <Typography.Text type='secondary'>Total Chunks</Typography.Text>
              <div>
                <Tag color={hasKnowledge ? 'arcoblue' : 'gray'}>{status?.knowledge?.row_count || 0}</Tag>
              </div>
            </div>
            <div>
              <Typography.Text type='secondary'>Storage</Typography.Text>
              <div>
                <Tag color={hasKnowledge ? 'green' : 'gray'}>{status?.size_mb ? `${status.size_mb} MB` : '0 MB'}</Tag>
              </div>
            </div>
            <div>
              <Typography.Text type='secondary'>Version</Typography.Text>
              <div>
                <Tag color={hasKnowledge ? 'purple' : 'gray'}>{hasKnowledge ? status?.knowledge?.version : 'Not initialized'}</Tag>
              </div>
            </div>
          </div>
          {status?.path && (
            <div>
              <Typography.Text type='secondary'>Path: </Typography.Text>
              <Typography.Text copyable style={{ fontSize: '12px' }}>
                {status.path}
              </Typography.Text>
            </div>
          )}
          {!hasKnowledge && status?.initialized && (
            <div style={{ marginTop: '8px' }}>
              <Typography.Text type='secondary' style={{ fontSize: '12px' }}>
                Your knowledge base is ready but empty. Upload documents through the chat interface or ingest files via the API to start using RAG.
              </Typography.Text>
            </div>
          )}
        </Space>
      </Card>
    );
  };

  return (
    <SettingsPageWrapper>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Typography.Title heading={5} style={{ margin: 0 }}>
              Knowledge Base
            </Typography.Title>
            <Typography.Text type='secondary'>Manage your indexed documents and embeddings for AI-powered search</Typography.Text>
          </div>
          <Space>
            <Button icon={<History />} onClick={handleShowVersions} disabled={!status?.knowledge}>
              Version History
            </Button>
            <Button icon={<Tool />} onClick={handleReindex} loading={reindexing} disabled={!status?.knowledge}>
              Reindex
            </Button>
            <Button icon={<Delete />} status='danger' onClick={handleClear} loading={clearing} disabled={!status?.knowledge}>
              Clear All
            </Button>
          </Space>
        </div>

        {renderStatusCard()}

        {/* Search Test Card */}
        <Card title='Search Test' style={{ marginBottom: '16px' }}>
          <Space direction='vertical' style={{ width: '100%' }}>
            <Space>
              <Input placeholder='Enter search query...' value={searchQuery} onChange={setSearchQuery} onPressEnter={() => void handleSearch()} style={{ width: '400px' }} disabled={!status?.knowledge?.row_count} />
              <Input.Group compact>
                <Button type={searchType === 'hybrid' ? 'primary' : 'secondary'} onClick={() => setSearchType('hybrid')}>
                  Hybrid
                </Button>
                <Button type={searchType === 'vector' ? 'primary' : 'secondary'} onClick={() => setSearchType('vector')}>
                  Vector
                </Button>
                <Button type={searchType === 'fts' ? 'primary' : 'secondary'} onClick={() => setSearchType('fts')}>
                  Keyword
                </Button>
              </Input.Group>
              <Button type='primary' icon={<Search />} onClick={() => void handleSearch()} loading={searching} disabled={!status?.knowledge?.row_count || !searchQuery.trim()}>
                Search
              </Button>
            </Space>
            {searchResults.length > 0 && <Table columns={searchResultColumns} data={searchResults} rowKey='id' pagination={false} size='small' style={{ marginTop: '16px' }} />}
          </Space>
        </Card>

        {/* Documents Card */}
        <Card title={`Indexed Documents (${sources.length})`}>
          <Table
            columns={sourceColumns}
            data={sources}
            rowKey='file'
            loading={loadingDocs}
            pagination={{
              defaultPageSize: 10,
              showTotal: true,
              sizeCanChange: true,
              sizeOptions: [10, 20, 50],
            }}
            noDataElement={<Empty icon={<DataAll style={{ fontSize: '48px', color: 'var(--color-text-4)' }} />} description='No documents indexed yet. Upload files through the chat interface to add them to your knowledge base.' />}
          />
        </Card>
      </div>

      {/* Version History Modal */}
      <Modal visible={versionsVisible} title='Version History' onCancel={() => setVersionsVisible(false)} footer={null} style={{ width: '600px' }}>
        <Typography.Paragraph type='secondary' style={{ marginBottom: '16px' }}>
          Each modification to your knowledge base creates a new version. You can restore to any previous version.
        </Typography.Paragraph>
        <Table columns={versionColumns} data={versions} rowKey='version' loading={loadingVersions} pagination={false} size='small' />
      </Modal>
    </SettingsPageWrapper>
  );
};

export default KnowledgeBase;
