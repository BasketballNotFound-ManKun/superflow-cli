CREATE TABLE attempt_record (
  business_id VARCHAR(32) NOT NULL,
  round_number INT NOT NULL,
  state INT NOT NULL,
  verification_token VARCHAR(32),
  PRIMARY KEY (business_id, round_number)
);
INSERT INTO attempt_record VALUES
 ('target', 2, 0, NULL), ('target', 1, 2, 'old-token'),
 ('other', 2, 0, 'other-token');
