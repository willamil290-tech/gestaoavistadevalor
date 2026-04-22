-- Tabela genérica para armazenar dados do app por chave (totais, logs, configurações)
-- Substitui o uso do Google Sheets como fonte da verdade
CREATE TABLE public.app_data (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index para buscas por prefixo (ex: acionGeral:, bitrixEvents:)
CREATE INDEX idx_app_data_key_prefix ON public.app_data (key text_pattern_ops);

-- Habilita RLS
ALTER TABLE public.app_data ENABLE ROW LEVEL SECURITY;

-- App usa autenticação local (devalor/devalor123) sem Supabase Auth.
-- Acesso público controlado pela camada de aplicação.
CREATE POLICY "Public read access"
  ON public.app_data FOR SELECT
  USING (true);

CREATE POLICY "Public write access"
  ON public.app_data FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public update access"
  ON public.app_data FOR UPDATE
  USING (true);

CREATE POLICY "Public delete access"
  ON public.app_data FOR DELETE
  USING (true);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_app_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_app_data_updated_at
BEFORE UPDATE ON public.app_data
FOR EACH ROW EXECUTE FUNCTION public.update_app_data_updated_at();