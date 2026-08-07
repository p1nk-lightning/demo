CREATE TABLE IF NOT EXISTS dictionary_forms (
  dictionary_id TEXT NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
  normalized TEXT NOT NULL,
  lemma_normalized TEXT NOT NULL,
  form TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (dictionary_id, normalized, lemma_normalized)
);

CREATE INDEX IF NOT EXISTS idx_dictionary_forms_normalized
ON dictionary_forms(normalized, dictionary_id);
