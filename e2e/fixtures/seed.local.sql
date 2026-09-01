DELETE FROM dictionary_entries WHERE dictionary_id = 'e2e-dict';
DELETE FROM dictionaries WHERE id = 'e2e-dict';
INSERT INTO dictionaries (id, name, description, license, source_url, priority, updated_at) VALUES ('e2e-dict', 'E2E 冒烟词典', 'e2e fixture', 'MIT', 'https://example.com', 0, 1788270398583);
INSERT INTO dictionary_entries (dictionary_id, normalized, headword, phonetic, part_of_speech, definition_en, definition_zh, example_en, difficulty, frequency_rank, updated_at) VALUES
  ('e2e-dict', 'analyze', 'analyze', NULL, 'n.', NULL, 'analyze 的测试释义', NULL, 'CET4', NULL, 1788270398583),
  ('e2e-dict', 'context', 'context', NULL, 'n.', NULL, 'context 的测试释义', NULL, 'CET4', NULL, 1788270398583),
  ('e2e-dict', 'pattern', 'pattern', NULL, 'n.', NULL, 'pattern 的测试释义', NULL, 'CET4', NULL, 1788270398583),
  ('e2e-dict', 'current', 'current', NULL, 'n.', NULL, 'current 的测试释义', NULL, 'CET4', NULL, 1788270398583),
  ('e2e-dict', 'reveal', 'reveal', NULL, 'n.', NULL, 'reveal 的测试释义', NULL, 'CET4', NULL, 1788270398583),
  ('e2e-dict', 'signal', 'signal', NULL, 'n.', NULL, 'signal 的测试释义', NULL, 'CET4', NULL, 1788270398583),
  ('e2e-dict', 'climate', 'climate', NULL, 'n.', NULL, 'climate 的测试释义', NULL, 'CET4', NULL, 1788270398583),
  ('e2e-dict', 'species', 'species', NULL, 'n.', NULL, 'species 的测试释义', NULL, 'CET4', NULL, 1788270398583),
  ('e2e-dict', 'mental', 'mental', NULL, 'n.', NULL, 'mental 的测试释义', NULL, 'CET4', NULL, 1788270398583),
  ('e2e-dict', 'reduce', 'reduce', NULL, 'n.', NULL, 'reduce 的测试释义', NULL, 'CET4', NULL, 1788270398583),
  ('e2e-dict', 'focus', 'focus', NULL, 'n.', NULL, 'focus 的测试释义', NULL, 'CET4', NULL, 1788270398583),
  ('e2e-dict', 'behavior', 'behavior', NULL, 'n.', NULL, 'behavior 的测试释义', NULL, 'CET4', NULL, 1788270398583);