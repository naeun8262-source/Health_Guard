-- pgvector 익스텐션 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- 법령 및 과태료 데이터를 저장할 safety_laws 테이블 생성
CREATE TABLE IF NOT EXISTS safety_laws (
  id BIGSERIAL PRIMARY KEY,
  law_name TEXT NOT NULL,               -- 법령명 (예: 산업안전보건법)
  article_number TEXT NOT NULL,         -- 조항 또는 별표 번호
  content TEXT NOT NULL,                -- 조항 본문 또는 과태료 내용 (Markdown)
  embedding vector(1536),               -- OpenAI 임베딩용 (1536 차원)
  metadata JSONB,                       -- 추가 메타데이터 (위반행위, 차수별 과태료 등)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 벡터 검색 속도 향상을 위한 인덱스 생성 (hnsw)
CREATE INDEX ON safety_laws USING hnsw (embedding vector_cosine_ops);

-- 유사 법령 검색용 RPC 함수 생성 (RAG 용도)
CREATE OR REPLACE FUNCTION match_safety_laws (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id bigint,
  law_name text,
  article_number text,
  content text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    safety_laws.id,
    safety_laws.law_name,
    safety_laws.article_number,
    safety_laws.content,
    1 - (safety_laws.embedding <=> query_embedding) AS similarity
  FROM safety_laws
  WHERE 1 - (safety_laws.embedding <=> query_embedding) > match_threshold
  ORDER BY safety_laws.embedding <=> query_embedding
  LIMIT match_count;
$$;
