# AionUi Database System

This document describes AionUi's database system, which uses **better-sqlite3** (main process) for persistent storage.

## Architecture Overview

```text
┌─────────────────────────────────────┐
│         Main Process                │
│                                     │
│  ┌─────────────────────────────┐   │
│  │   better-sqlite3            │   │
│  │   - Account system          │   │
│  │   - Chat history persistence│   │
│  │   - Config info (db_version)│   │
│  └─────────────────────────────┘   │
│              ↕ IPC                  │
└─────────────────────────────────────┘
              ↕ IPC
┌─────────────────────────────────────┐
│       Renderer Process              │
│                                     │
│  - IPC Bridge queries main process  │
│  - React State manages UI state     │
│  - localStorage saves temp data     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│         File System                 │
│                                     │
│  - Image files (message.resultDisplay) │
│  - Large file attachments           │
│  - Database file (aionui.db)        │
└─────────────────────────────────────┘
```

## Design Features

### ✅ Reuses Existing Type System

The database layer fully reuses existing business type definitions:

- `TChatConversation` - Conversation type
- `TMessage` - Message type

### ✅ Automatic Migration

On first startup, the system automatically migrates file storage data to the database without manual intervention.

### ✅ Image Storage

- Image files are stored in the file system
- Image paths are referenced via message.resultDisplay field
- Image metadata is not stored in the database

### ✅ High Performance

- better-sqlite3's synchronous API avoids mutex contention
- WAL mode improves concurrent performance
- Well-designed indexes
- Transaction support

## Usage

### Main Process

```typescript
import { getDatabase } from '@/process/database/export';

// Get database instance
const db = getDatabase();

// Create conversation
const conversation: TChatConversation = {
  id: 'conv_123',
  name: 'My Conversation',
  type: 'gemini',
  extra: { workspace: '/path/to/workspace' },
  model: {
    /* provider info */
  },
  createTime: Date.now(),
  modifyTime: Date.now(),
};

const result = db.createConversation(conversation);
if (result.success) {
  console.log('Conversation created');
}

// Insert message
const message: TMessage = {
  id: 'msg_123',
  conversation_id: 'conv_123',
  type: 'text',
  content: { content: 'Hello world' },
  position: 'right',
  createdAt: Date.now(),
};

db.insertMessage(message);

// Query conversation messages (paginated)
const messages = db.getConversationMessages('conv_123', 0, 50);
console.log(messages.data); // TMessage[]
```

### Renderer Process

```typescript
import { ipcBridge } from '@/common';

// Query messages via IPC
const messages = await ipcBridge.database.getConversationMessages({
  conversation_id: 'conv_123',
  page: 0,
  pageSize: 100,
});

// Drafts use React state management
const [draft, setDraft] = useState('');

// UI state uses localStorage
localStorage.setItem('sidebar_collapsed', 'true');
const collapsed = localStorage.getItem('sidebar_collapsed') === 'true';
```

## Database File Location

- **Database file**: `{userData}/config/aionui.db`
- **Image files**: `{userData}/data/images/`

Where `{userData}` is:

- macOS: `~/Library/Application Support/AionUi/`
- Windows: `%APPDATA%/AionUi/`
- Linux: `~/.config/AionUi/`

## Migration Management

### Check Migration Status

```typescript
import { getMigrationStatus } from '@/process/database/export';

const status = await getMigrationStatus();
console.log(status);
// {
//   completed: true,
//   date: 1738012345678,
//   version: 1,
//   stats: { conversations: 10, messages: 532, ... }
// }
```

### Manually Trigger Migration

```typescript
import { migrateFileStorageToDatabase } from '@/process/database/export';

const result = await migrateFileStorageToDatabase();
if (result.success) {
  console.log('Migration completed:', result.stats);
} else {
  console.error('Migration errors:', result.errors);
}
```

### Rollback Migration (for testing)

```typescript
import { rollbackMigration } from '@/process/database/export';

await rollbackMigration();
// Clears migration flag, allowing migration to run again
```

## Backup and Restore

### Export Data

```typescript
import { exportDatabaseToJSON } from '@/process/database/export';

const data = await exportDatabaseToJSON();
await fs.writeFile('backup.json', JSON.stringify(data, null, 2));
```

### Import Data

```typescript
import { importDatabaseFromJSON } from '@/process/database/export';

const data = JSON.parse(await fs.readFile('backup.json', 'utf-8'));
await importDatabaseFromJSON(data);
```

### Database File Backup

Simply copy the `aionui.db` and `aionui.db-wal` files.

## API Reference

### AionUIDatabase Main Methods

#### Conversation Operations

- `createConversation(conversation, userId?)` - Create conversation
- `getConversation(conversationId)` - Get conversation
- `getUserConversations(userId?, page?, pageSize?)` - Get all user conversations (paginated)
- `updateConversation(conversationId, updates)` - Update conversation
- `deleteConversation(conversationId)` - Delete conversation

#### Message Operations

- `insertMessage(message)` - Insert single message
- `insertMessages(messages)` - Batch insert messages
- `getConversationMessages(conversationId, page?, pageSize?)` - Get conversation messages (paginated)
- `deleteConversationMessages(conversationId)` - Delete all messages in conversation

#### Config Operations

- `setConfig(key, value)` - Set config (mainly for database version tracking)
- `getConfig<T>(key)` - Get config
- `getAllConfigs()` - Get all configs
- `deleteConfig(key)` - Delete config

#### Utility Methods

- `getStats()` - Get database statistics (returns: users, conversations, messages)
- `vacuum()` - Clean database, reclaim space

### IPC Bridge Methods

- `database.getConversationMessages({ conversation_id, page?, pageSize? })` - Query messages (supports pagination)

## Performance Optimization Tips

1. **Batch insert messages**: Use `insertMessages()` instead of looping `insertMessage()`
2. **Paginated queries**: Use pagination parameters for large datasets
3. **Regular cleanup**: Periodically call `db.vacuum()` to clean the database
4. **WAL mode**: Database has WAL mode enabled, supports read/write concurrency
5. **Image deduplication**: System automatically deduplicates via hash, no extra handling needed

## Troubleshooting

### Database Lock Error

If "database is locked" error occurs:

1. Ensure only one application instance is running
2. Check if other processes are accessing the database file
3. Restart the application

### Migration Failed

If migration fails:

1. Check error logs to determine the specific cause
2. Use `rollbackMigration()` to rollback
3. Fix data issues and re-run migration

### Native Module Issues

If better-sqlite3 fails to load:

1. Run `npm rebuild better-sqlite3`
2. Confirm Electron version is compatible with dependencies
3. Check Electron Forge configuration

## Database Version Upgrade and Migration

### Version Management

Database Schema has version control, current version is **v4**. Each version upgrade has a corresponding migration script.

```typescript
import { getDatabase } from '@/process/database/export';

const db = getDatabase();

// View migration history
const history = db.getMigrationHistory();
console.log(history);
// [
//   { version: 1, name: 'Initial schema', timestamp: 1738012345678 },
//   { version: 2, name: 'Add performance indexes', timestamp: 1738012345679 },
//   ...
// ]

// Check if specific migration has been applied
const isV2Applied = db.isMigrationApplied(2);
```

### Migration Scripts

Migration scripts are defined in `migrations.ts`. Each migration includes:

- **version**: Target version number
- **name**: Migration name
- **up()**: Upgrade script
- **down()**: Downgrade script (for rollback)

#### Current Migration List

- **v1**: Initial Schema (users, conversations, messages, configs)
- **v2**: Add performance indexes (composite indexes for query optimization)
- **v3**: ~~Add full-text search support~~ (skipped, doesn't create FTS tables)
- **v4**: Add user preferences table
- **v5**: Delete FTS tables (cleanup v3 legacy tables, ensure database structure consistency)

### Migration Features

#### ✅ Transaction Protection

All migrations run in a single transaction. If any migration fails, all changes are rolled back.

#### ✅ Migration History

Each successful migration is recorded in the `configs` table.

#### ✅ Idempotency

All migrations use `IF NOT EXISTS` to ensure safe repeated runs.

### Migration Best Practices

1. **Backward compatibility**: Prefer `ALTER TABLE ADD COLUMN` over deleting fields
2. **Data transformation**: Handle data format changes in migrations
3. **Index optimization**: Adding indexes doesn't affect existing data
4. **Test rollback**: Ensure `down()` method correctly restores state
5. **Small migrations**: One migration does one thing

## Future Plans

- [x] Database version upgrade and migration system
- [ ] Support multi-user account system
- [ ] Data encryption
- [ ] Cloud sync
- [ ] More query APIs (search, filter, etc.)
- [ ] Performance monitoring and optimization
- [ ] Data analysis and statistics

## Tech Stack

- **better-sqlite3** v12.4.1 - Main process SQLite database
- **Electron IPC Bridge** - Renderer to main process communication
- **Electron Forge** - Auto-handles native modules

## Contributing

To add new database features:

1. Add table structure in `schema.ts`
2. Define types in `types.ts` (prefer reusing existing business types)
3. Add CRUD methods in `index.ts`
4. Update this README document

---

**Last Updated**: 2025-01-27
