CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  artist_address TEXT,
  contract_address TEXT,
  display_name TEXT,
  metadata JSON,
  state TEXT DEFAULT 'draft',
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS assets (
  asset_id TEXT PRIMARY KEY,
  collection_id TEXT,
  path TEXT,
  filename TEXT,
  mime_type TEXT,
  total_bytes INTEGER,
  total_chunks INTEGER,
  expected_hash TEXT,
  storage_key TEXT,
  edition_cap INTEGER,
  state TEXT DEFAULT 'draft',
  expires_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS reservations (
  reservation_id TEXT PRIMARY KEY,
  collection_id TEXT,
  asset_id TEXT,
  buyer_address TEXT,
  hash_hex TEXT,
  status TEXT,
  tx_id TEXT,
  expires_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);
