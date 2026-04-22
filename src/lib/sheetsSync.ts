// Compatibility shim — toda persistência agora vai para o Lovable Cloud.
// Mantém os mesmos nomes para não quebrar consumidores existentes.
export {
  isBusinessKey,
  wasJustBootstrapped,
  pushKeyToSheets,
  pushKeyToSheetsNow,
  pullAllFromSheets,
  pullKeyFromSheets,
  flushPendingPushes,
} from "@/lib/cloudSync";
