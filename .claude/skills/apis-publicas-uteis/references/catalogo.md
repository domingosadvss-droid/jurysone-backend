# Catálogo — APIs públicas selecionadas

Curadoria a partir de [public-apis/public-apis](https://github.com/public-apis/public-apis) (MIT), filtrada para as necessidades do JurysOne. Não é a lista completa — para o catálogo integral (milhares de APIs em todas as categorias), consultar o repositório original. Campos: **Auth** (tipo de autenticação exigida), **grátis** (se tem tier gratuito, pelo texto da descrição original).

## Jurídico / dados de empresa e pessoa (BR)

| API | O que faz | Auth |
|---|---|---|
| [BrasilAPI](https://brasilapi.com.br/) | API comunitária agregando dados públicos do Brasil (CEP, CNPJ, bancos, feriados, DDD, etc. em um só lugar) | Não |
| [Receita WS](https://www.receitaws.com.br/) | Consulta de empresas por CNPJ direto na Receita Federal | Não |
| [Radar CNPJ](https://radar-cnpj.com/api/) | Busca de empresas por CNPJ com checagem de mercado por área e monitoramento | Não |
| [CPFHub](https://cpfhub.io) | Consulta de CPF — nome completo, data de nascimento, gênero | apiKey |
| [IBGE](https://servicodados.ibge.gov.br/api/docs/) | Dados agregados do IBGE (geografia, população, municípios) | Não |
| [Câmara dos Deputados — Dados Abertos](https://dadosabertos.camara.leg.br/swagger/api.html) | Informação legislativa federal (proposições, votações) em XML/JSON | Não |
| [Banco Central — Dados Abertos](https://dadosabertos.bcb.gov.br/) | Dados abertos do Banco Central do Brasil | Não |
| [EditalMD](https://editalmd.com/api/) | Editais de licitação pública brasileira (PNCP) em Markdown, com prazos e requisitos | Não |
| [markerapi](https://markerapi.com) | Busca de marca registrada (trademark search) | Não — relevante para propriedade intelectual |
| [ViaCEP](https://viacep.com.br) | CEP brasileiro → endereço completo | Não |

## Financeiro

| API | O que faz | Auth |
|---|---|---|
| [Banco do Brasil](https://developers.bb.com.br/home) | Todas as APIs oficiais de transação financeira do Banco do Brasil | OAuth |
| [Boleto.Cloud](https://boleto.cloud/) | Geração de boletos bancários no Brasil | apiKey |
| [MercadoPago](https://www.mercadopago.com.br/developers/es/reference) | API de pagamento do Mercado Pago (cartão, Pix, boleto) | apiKey |
| [Tax Data (apilayer)](https://apilayer.com/marketplace/tax_data-api) | Validação de número de VAT/imposto internacional | apiKey |
| [VAT Validation](https://www.abstractapi.com/vat-validation-rates-api) | Validação de VAT e cálculo de alíquotas | apiKey |

## Geração e processamento de documento (dev — apoia peças, contratos, e-signature)

| API | O que faz | Auth |
|---|---|---|
| [PandaDoc](https://developers.pandadoc.com) | Geração de documento + e-signature via API | apiKey |
| [staffSign](https://staffsign.de/docs) | Contrato de trabalho digital com QES/eIDAS (assinatura qualificada) | apiKey |
| [iLovePDF](https://developer.ilovepdf.com/) | Converter, mesclar, dividir, extrair texto de PDF — grátis até 250 documentos/mês | apiKey |
| [OCR.Space](https://ocr.space/ocrapi) | OCR (extração de texto) de imagem/PDF, com tier grátis | apiKey |
| [CraftMyPDF](https://craftmypdf.com) | Gera PDF a partir de template com editor drag-and-drop | apiKey |
| [Html2PDF](https://html2pdf.app/) | Converte HTML/URL em PDF | apiKey |
| [Renderly](https://renderlyapi.com) | HTML → PDF via Chromium | apiKey |
| [Rendex](https://rendex.dev) | HTML/Markdown/URL → PNG/JPEG/WebP/PDF, com extração e templating | apiKey |
| [DocStruct](https://docstruct.pages.dev) | Extração por IA de fatura, recibo, extrato bancário e contrato em JSON/CSV estruturado | Não |

## Como usar este catálogo
Ao integrar qualquer uma dessas APIs no código do JurysOne: confirmar o tier gratuito atual (mudam com frequência), ler os termos de uso, nunca commitar a chave (usar variável de ambiente), e — se a API tratar CPF/CNPJ/e-mail de cliente — registrar isso no mapeamento de dados da skill [lgpd-compliance](../../lgpd-compliance/SKILL.md).
