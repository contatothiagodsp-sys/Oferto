'use strict';
const { sha256Hex } = require('./sha256');
const { LOJAS_KPOP_SHOPEE } = require('./shopee');

const NOMES = {
  amazon: 'Amazon', shopee: 'Shopee', ml: 'Mercado Livre', shein: 'Shein', tiktok: 'TikTok Shop', aliexpress: 'AliExpress',
  kabum: 'KaBuM!', terabyte: 'Terabyte', pichau: 'Pichau',
  acer: 'Acer Store', motorola: 'Motorola', samsung: 'Samsung Shop',
  drogaraia: 'Droga Raia', drogasil: 'Drogasil', pacheco: 'Drogaria Pacheco', panvel: 'Panvel',
  araujo: 'Drogaria Araujo', paguemenos: 'Pague Menos', venancio: 'Drogaria Venancio',
  oficialfarma: 'Oficial Farma', maxtitanium: 'Max Titanium',
  rihappy: 'Ri Happy', alobebe: 'Alô Bebê',
  belezanaweb: 'Beleza na Web', epocacosmeticos: 'Época Cosméticos', boticario: 'O Boticário',
  natura: 'Natura', sephora: 'Sephora', mahogany: 'Mahogany', creamy: 'Creamy', ikesaki: 'Ikesaki',
  centauro: 'Centauro', netshoes: 'Netshoes', nike: 'Nike', adidas: 'Adidas',
  olympikus: 'Olympikus', mizuno: 'Mizuno', underarmour: 'Under Armour', farmrio: 'FARM Rio',
  renner: 'Renner', cea: 'C&A', riachuelo: 'Riachuelo', dafiti: 'Dafiti', zattini: 'Zattini', hering: 'Hering',
  polishop: 'Polishop', electrolux: 'Electrolux', brastemp: 'Brastemp', consul: 'Consul',
  magalu: 'Magalu',
  umusic: 'UMusic Store',
  klinestore: 'K-Line Store',
  hopescolor: 'Hopescolor',
  asiaticstore: 'Asiatic Store',
  kpopandyoushop: 'Kpop and You Shop',
  kpopalbums: 'KpopAlbums',
  kpopmerch: 'Kpopmerch',
  ktown4u: 'Ktown4u',
  weverse: 'Weverse Shop',
  cokodive: 'Cokodive',
  daebak: 'Daebak',
  cdjapan: 'CDJapan',
  yesasia: 'YesAsia',
  kpop1004: 'KPOP1004',
  outra: 'Loja',
};

const PROGRAMAS_AFILIADO = {
  amazon: { programa: 'Amazon Associados', chave: 'amazon.tag_padrao', exemplo: 'suatag-20' },
  ml: { programa: 'Mercado Livre Afiliados', chave: 'ml.etiqueta', exemplo: 'matt_word:matt_tool (ou link /sec/)' },
  shopee: { programa: 'Shopee Affiliate Open API', chave: 'shopee.app_id', exemplo: 'App ID + Secret' },
  shein: { programa: 'Shein Afiliados', chave: 'shein.afiliado_id', exemplo: 'seu_aff_id' },
  aliexpress: { programa: 'AliExpress Affiliate Portal (até 7–9%, PF)', chave: 'afiliado.aliexpress', exemplo: 'parâmetro/template de afiliado' },
  kabum: { programa: 'Awin (KaBuM! mid 17729)', chave: 'awin.afiliado_id', awin_mid: '17729', exemplo: 'seu Publisher ID da Awin' },
  terabyte: { programa: 'Terabyte Parceiros (?p=)', chave: 'terabyte.afiliado_id', exemplo: 'seu código p da Terabyte' },
  pacheco: { programa: 'Rakuten Advertising (mid 53522)', chave: 'rakuten.id', rakuten_mid: '53522', exemplo: 'seu ID criptografado Rakuten' },
  belezanaweb: { programa: 'Rakuten Advertising (mid 47089)', chave: 'rakuten.id', rakuten_mid: '47089', exemplo: 'seu ID criptografado Rakuten' },
  natura: { programa: 'Consultoria Natura ou Rakuten (mid 49351)', chave: 'natura.consultoria', rakuten_mid: '49351', exemplo: 'seu_espaco (ou rakuten.id)' },
  boticario: { programa: 'Rakuten / Awin / Lomadee', chave: 'afiliado.boticario', exemplo: 'utm/parâmetro do seu link de afiliado' },
  epocacosmeticos: { programa: 'Magazine Você / Rakuten', chave: 'afiliado.epocacosmeticos', exemplo: 'parâmetro de afiliado' },
  sephora: { programa: 'Rakuten / Awin', chave: 'afiliado.sephora', exemplo: 'parâmetro de afiliado' },
  mahogany: { programa: 'Redes BR / Parcerias (Mahogany)', chave: 'afiliado.mahogany', exemplo: 'parâmetro de afiliado (opcional)' },
  creamy: { programa: 'Redes BR / Parceiros (Creamy)', chave: 'afiliado.creamy', exemplo: 'parâmetro de afiliado (opcional)' },
  ikesaki: { programa: 'Lomadee / Afilio (Ikesaki)', chave: 'afiliado.ikesaki', exemplo: 'parâmetro de afiliado (opcional)' },
  drogaraia: { programa: 'Awin / Lomadee (Raia Drogasil)', chave: 'afiliado.drogaraia', exemplo: 'parâmetro de afiliado (opcional)' },
  drogasil: { programa: 'Awin / Lomadee (Raia Drogasil)', chave: 'afiliado.drogasil', exemplo: 'parâmetro de afiliado (opcional)' },
  panvel: { programa: 'Lomadee / Redes BR (Panvel)', chave: 'afiliado.panvel', exemplo: 'parâmetro de afiliado (opcional)' },
  araujo: { programa: 'Lomadee / Afilio (Drogaria Araujo)', chave: 'afiliado.araujo', exemplo: 'parâmetro de afiliado (opcional)' },
  paguemenos: { programa: 'Minha Lojinha Pague Menos / Redes BR', chave: 'afiliado.paguemenos', exemplo: 'parâmetro de afiliado (opcional)' },
  venancio: { programa: 'Awin BR (Drogaria Venancio ~7% CPA, PF)', chave: 'afiliado.venancio', exemplo: 'parâmetro/template de afiliado' },
  oficialfarma: { programa: 'Oficial Farma Afiliados / Influenciadores', chave: 'afiliado.oficialfarma', exemplo: 'parâmetro/template de afiliado' },
  maxtitanium: { programa: 'Max Titanium Parceiros / Redes BR', chave: 'afiliado.maxtitanium', exemplo: 'parâmetro de afiliado (opcional)' },
  rihappy: { programa: 'Minha Ri Happy (~3%, PF)', chave: 'afiliado.rihappy', exemplo: 'parâmetro/template de afiliado' },
  alobebe: { programa: 'Lomadee / Redes BR (Alô Bebê)', chave: 'afiliado.alobebe', exemplo: 'parâmetro de afiliado (opcional)' },
  centauro: { programa: 'Awin / Lomadee (Centauro)', chave: 'afiliado.centauro', exemplo: 'parâmetro/link de afiliado (opcional)' },
  netshoes: { programa: 'Awin / Rakuten / Lomadee (Netshoes)', chave: 'afiliado.netshoes', exemplo: 'parâmetro/link de afiliado (opcional)' },
  nike: { programa: 'Awin / Social Commerce (Nike)', chave: 'afiliado.nike', exemplo: 'parâmetro/link de afiliado (opcional)' },
  adidas: { programa: 'Awin / Social Commerce (Adidas)', chave: 'afiliado.adidas', exemplo: 'parâmetro/link de afiliado (opcional)' },
  olympikus: { programa: 'Awin BR (Olympikus 6% CPA)', chave: 'afiliado.olympikus', exemplo: 'parâmetro/template de afiliado' },
  mizuno: { programa: 'Awin BR (Mizuno 6% CPA)', chave: 'afiliado.mizuno', exemplo: 'parâmetro/template de afiliado' },
  underarmour: { programa: 'Awin BR (Under Armour)', chave: 'afiliado.underarmour', exemplo: 'parâmetro/template de afiliado' },
  farmrio: { programa: 'Rakuten / Awin (FARM Rio)', chave: 'afiliado.farmrio', exemplo: 'parâmetro/template de afiliado' },
  renner: { programa: 'Awin / Lomadee (Renner)', chave: 'afiliado.renner', exemplo: 'parâmetro/link de afiliado (opcional)' },
  cea: { programa: 'Awin / Lomadee (C&A)', chave: 'afiliado.cea', exemplo: 'parâmetro/link de afiliado (opcional)' },
  riachuelo: { programa: 'Awin / Lomadee (Riachuelo)', chave: 'afiliado.riachuelo', exemplo: 'parâmetro/link de afiliado (opcional)' },
  dafiti: { programa: 'Awin / Lomadee (Dafiti)', chave: 'afiliado.dafiti', exemplo: 'parâmetro/link de afiliado (opcional)' },
  zattini: { programa: 'Awin / Rakuten (Zattini)', chave: 'afiliado.zattini', exemplo: 'parâmetro/link de afiliado (opcional)' },
  hering: { programa: 'Awin / Social Commerce (Hering)', chave: 'afiliado.hering', exemplo: 'parâmetro/link de afiliado (opcional)' },
  polishop: { programa: 'Minha Polishop / Awin', chave: 'afiliado.polishop', exemplo: 'parâmetro/template de afiliado' },
  electrolux: { programa: 'Electrolux Afiliados / Lomadee', chave: 'afiliado.electrolux', exemplo: 'parâmetro/template de afiliado' },
  brastemp: { programa: 'Awin (Grupo Whirlpool / Brastemp)', chave: 'afiliado.brastemp', exemplo: 'parâmetro/template de afiliado' },
  consul: { programa: 'Awin (Grupo Whirlpool / Consul)', chave: 'afiliado.consul', exemplo: 'parâmetro/template de afiliado' },
  acer: { programa: 'Awin / Lomadee (Acer Store BR)', chave: 'afiliado.acer', exemplo: 'parâmetro/template de afiliado' },
  motorola: { programa: 'Awin BR (Motorola 3% CPA)', chave: 'afiliado.motorola', exemplo: 'parâmetro/template de afiliado' },
  samsung: { programa: 'Awin BR (Samsung Shop)', chave: 'afiliado.samsung', exemplo: 'parâmetro/template de afiliado' },
  magalu: { programa: 'Parceiro Magalu / Magazine Você / Awin', chave: 'afiliado.magalu', exemplo: 'seu_parametro (ou divulgador.magalu.com)' },
  pichau: { programa: 'Pichau Creator Network (afiliados.pichau.com.br)', chave: 'afiliado.pichau', exemplo: 'parâmetro/link de afiliado (opcional)' },
  umusic: { programa: 'Awin / UMusic Store Brasil', chave: 'afiliado.umusic', exemplo: 'parâmetro/link de afiliado (Awin ou UTM)' },
  klinestore: { programa: 'K-Line Store (link direto / cupom parceiro)', chave: 'afiliado.klinestore', exemplo: 'parâmetro/link opcional', direto_padrao: true },
  hopescolor: { programa: 'Hopescolor (link direto / cupom parceiro)', chave: 'afiliado.hopescolor', exemplo: 'parâmetro/link opcional', direto_padrao: true },
  asiaticstore: { programa: 'Asiatic Store (link direto / cupom parceiro)', chave: 'afiliado.asiaticstore', exemplo: 'parâmetro/link opcional', direto_padrao: true },
  kpopandyoushop: { programa: 'Kpop and You Shop (link direto / cupom parceiro)', chave: 'afiliado.kpopandyoushop', exemplo: 'parâmetro/link opcional', direto_padrao: true },
  kpopalbums: { programa: 'KpopAlbums (Parceria / Código criador)', chave: 'afiliado.kpopalbums', exemplo: 'parâmetro/link opcional', direto_padrao: true },
  kpopmerch: { programa: 'Kpopmerch (Afiliado / UTM)', chave: 'afiliado.kpopmerch', exemplo: 'parâmetro/link de afiliado (opcional)' },
  ktown4u: { programa: 'Ktown4u (Afiliado / Fanclub)', chave: 'afiliado.ktown4u', exemplo: 'parâmetro/link de afiliado (opcional)' },
  weverse: { programa: 'Weverse Shop (link direto / UTM)', chave: 'afiliado.weverse', exemplo: 'parâmetro/link opcional', direto_padrao: true },
  cokodive: { programa: 'Cokodive Affiliate (10% CPA)', chave: 'afiliado.cokodive', exemplo: 'parâmetro/template de afiliado' },
  daebak: { programa: 'Daebak Affiliate (10% CPA)', chave: 'afiliado.daebak', exemplo: 'parâmetro/template de afiliado' },
  cdjapan: { programa: 'CDJapan Affiliate (5–7%, 30d)', chave: 'afiliado.cdjapan', exemplo: 'parâmetro/template de afiliado' },
  yesasia: { programa: 'YesAsia Affiliate (Awin, 2–4%)', chave: 'afiliado.yesasia', exemplo: 'parâmetro/template de afiliado' },
  kpop1004: { programa: 'KPOP1004 Affiliate (10% CPA)', chave: 'afiliado.kpop1004', exemplo: 'parâmetro/template de afiliado' },
};

const CENTRAL_CUPONS_LOJA = {
  ml: 'https://www.mercadolivre.com.br/cupons',
  amazon: 'https://www.amazon.com.br/coupons',
  shopee: 'https://shopee.com.br/m/cupons-diarios',
  shein: 'https://br.shein.com/',
  kabum: 'https://www.kabum.com.br/cupons',
  centauro: 'https://www.centauro.com.br/cupons',
  netshoes: 'https://www.netshoes.com.br/especial/cupons',
  nike: 'https://www.nike.com.br/ofertas',
  adidas: 'https://www.adidas.com.br/outlet',
  renner: 'https://www.lojasrenner.com.br/cupons',
  cea: 'https://www.cea.com.br/cupons',
  riachuelo: 'https://www.riachuelo.com.br/cupons',
  dafiti: 'https://www.dafiti.com.br/cupons/',
  zattini: 'https://www.zattini.com.br/especial/cupons',
  hering: 'https://www.hering.com.br/cupons',
  boticario: 'https://www.boticario.com.br/cupom-de-desconto/',
  natura: 'https://www.natura.com.br/c/cupons',
  belezanaweb: 'https://www.belezanaweb.com.br/cupons',
  drogaraia: 'https://www.drogaraia.com.br/cupons',
  drogasil: 'https://www.drogasil.com.br/cupons',
  magalu: 'https://www.magazineluiza.com.br/cupons/',
};

const LOGO_LOJA_PADRAO = {
  ml: 'https://www.google.com/s2/favicons?domain=mercadolivre.com.br&sz=256',
  amazon: 'https://www.google.com/s2/favicons?domain=amazon.com.br&sz=256',
  shopee: 'https://www.google.com/s2/favicons?domain=shopee.com.br&sz=256',
  shein: 'https://www.google.com/s2/favicons?domain=shein.com&sz=256',
  tiktok: 'https://www.google.com/s2/favicons?domain=tiktok.com&sz=256',
  kabum: 'https://www.google.com/s2/favicons?domain=kabum.com.br&sz=256',
  centauro: 'https://www.google.com/s2/favicons?domain=centauro.com.br&sz=256',
  netshoes: 'https://www.google.com/s2/favicons?domain=netshoes.com.br&sz=256',
  renner: 'https://www.google.com/s2/favicons?domain=lojasrenner.com.br&sz=256',
  cea: 'https://www.google.com/s2/favicons?domain=cea.com.br&sz=256',
  riachuelo: 'https://www.google.com/s2/favicons?domain=riachuelo.com.br&sz=256',
  dafiti: 'https://www.google.com/s2/favicons?domain=dafiti.com.br&sz=256',
  boticario: 'https://www.google.com/s2/favicons?domain=boticario.com.br&sz=256',
  natura: 'https://www.google.com/s2/favicons?domain=natura.com.br&sz=256',
  magalu: 'https://www.google.com/s2/favicons?domain=magazineluiza.com.br&sz=256',
  umusic: 'https://www.google.com/s2/favicons?domain=umusicstore.com&sz=256',
  klinestore: 'https://www.google.com/s2/favicons?domain=klinestore.com.br&sz=256',
  hopescolor: 'https://www.google.com/s2/favicons?domain=hopescolor.com&sz=256',
  asiaticstore: 'https://www.google.com/s2/favicons?domain=asiaticstore.com.br&sz=256',
  kpopmerch: 'https://www.google.com/s2/favicons?domain=kpopmerch.com&sz=256',
  ktown4u: 'https://www.google.com/s2/favicons?domain=ktown4u.com&sz=256',
  weverse: 'https://www.google.com/s2/favicons?domain=weverse.io&sz=256',
};

const LOJAS_CAMINHO = [
  { rx: /(^|\.)drogaraia\.com\.br$/, loja: 'drogaraia', pref: 'dra_', origin: 'https://www.drogaraia.com.br' },
  { rx: /(^|\.)drogasil\.com\.br$/, loja: 'drogasil', pref: 'drs_', origin: 'https://www.drogasil.com.br' },
  { rx: /(^|\.)drogariaspacheco\.com\.br$/, loja: 'pacheco', pref: 'dpa_', origin: 'https://www.drogariaspacheco.com.br' },
  { rx: /(^|\.)drogariasaopaulo\.com\.br$/, loja: 'pacheco', pref: 'dpa_', origin: 'https://www.drogariasaopaulo.com.br' },
  { rx: /(^|\.)panvel\.com$/, loja: 'panvel', pref: 'pnv_', origin: 'https://www.panvel.com' },
  { rx: /(^|\.)araujo\.com\.br$/, loja: 'araujo', pref: 'arj_', origin: 'https://www.araujo.com.br' },
  { rx: /(^|\.)paguemenos\.com\.br$/, loja: 'paguemenos', pref: 'pgm_', origin: 'https://www.paguemenos.com.br' },
  { rx: /(^|\.)drogariavenancio\.com\.br$/, loja: 'venancio', pref: 'ven_', origin: 'https://www.drogariavenancio.com.br' },
  { rx: /(^|\.)oficialfarma\.com\.br$/, loja: 'oficialfarma', pref: 'off_', origin: 'https://www.oficialfarma.com.br' },
  { rx: /(^|\.)maxtitanium\.com\.br$/, loja: 'maxtitanium', pref: 'mxt_', origin: 'https://www.maxtitanium.com.br' },
  { rx: /(^|\.)rihappy\.com\.br$/, loja: 'rihappy', pref: 'rhy_', origin: 'https://www.rihappy.com.br' },
  { rx: /(^|\.)alobebe\.com\.br$/, loja: 'alobebe', pref: 'alb_', origin: 'https://www.alobebe.com.br' },
  { rx: /(^|\.)belezanaweb\.com\.br$/, loja: 'belezanaweb', pref: 'bnw_', origin: 'https://www.belezanaweb.com.br' },
  { rx: /(^|\.)epocacosmeticos\.com\.br$/, loja: 'epocacosmeticos', pref: 'epc_', origin: 'https://www.epocacosmeticos.com.br' },
  { rx: /(^|\.)boticario\.com\.br$/, loja: 'boticario', pref: 'bot_', origin: 'https://www.boticario.com.br' },
  { rx: /(^|\.)natura\.com\.br$/, loja: 'natura', pref: 'nat_', origin: 'https://www.natura.com.br' },
  { rx: /(^|\.)sephora\.com\.br$/, loja: 'sephora', pref: 'sep_', origin: 'https://www.sephora.com.br' },
  { rx: /(^|\.)mahogany\.com\.br$/, loja: 'mahogany', pref: 'mhg_', origin: 'https://www.mahogany.com.br' },
  { rx: /(^|\.)creamy\.com\.br$/, loja: 'creamy', pref: 'crm_', origin: 'https://www.creamy.com.br' },
  { rx: /(^|\.)ikesaki\.com\.br$/, loja: 'ikesaki', pref: 'iks_', origin: 'https://www.ikesaki.com.br' },
  { rx: /(^|\.)centauro\.com\.br$/, loja: 'centauro', pref: 'cen_', origin: 'https://www.centauro.com.br' },
  { rx: /(^|\.)netshoes\.com\.br$/, loja: 'netshoes', pref: 'net_', origin: 'https://www.netshoes.com.br' },
  { rx: /(^|\.)nike\.com\.br$/, loja: 'nike', pref: 'nik_', origin: 'https://www.nike.com.br' },
  { rx: /(^|\.)adidas\.com\.br$/, loja: 'adidas', pref: 'adi_', origin: 'https://www.adidas.com.br' },
  { rx: /(^|\.)olympikus\.com\.br$/, loja: 'olympikus', pref: 'oly_', origin: 'https://www.olympikus.com.br' },
  { rx: /(^|\.)mizuno\.com\.br$/, loja: 'mizuno', pref: 'miz_', origin: 'https://www.mizuno.com.br' },
  { rx: /(^|\.)underarmour\.com\.br$/, loja: 'underarmour', pref: 'uar_', origin: 'https://www.underarmour.com.br' },
  { rx: /(^|\.)farmrio\.com\.br$/, loja: 'farmrio', pref: 'frm_', origin: 'https://www.farmrio.com.br' },
  { rx: /(^|\.)lojasrenner\.com\.br$/, loja: 'renner', pref: 'ren_', origin: 'https://www.lojasrenner.com.br' },
  { rx: /(^|\.)cea\.com\.br$/, loja: 'cea', pref: 'cea_', origin: 'https://www.cea.com.br' },
  { rx: /(^|\.)riachuelo\.com\.br$/, loja: 'riachuelo', pref: 'rch_', origin: 'https://www.riachuelo.com.br' },
  { rx: /(^|\.)dafiti\.com\.br$/, loja: 'dafiti', pref: 'daf_', origin: 'https://www.dafiti.com.br' },
  { rx: /(^|\.)zattini\.com\.br$/, loja: 'zattini', pref: 'zat_', origin: 'https://www.zattini.com.br' },
  { rx: /(^|\.)hering\.com\.br$/, loja: 'hering', pref: 'her_', origin: 'https://www.hering.com.br' },
  { rx: /(^|\.)polishop\.com\.br$/, loja: 'polishop', pref: 'pol_', origin: 'https://www.polishop.com.br' },
  { rx: /(^|\.)electrolux\.com\.br$/, loja: 'electrolux', pref: 'elx_', origin: 'https://loja.electrolux.com.br' },
  { rx: /(^|\.)brastemp\.com\.br$/, loja: 'brastemp', pref: 'brs_', origin: 'https://www.brastemp.com.br' },
  { rx: /(^|\.)consul\.com\.br$/, loja: 'consul', pref: 'cns_', origin: 'https://www.consul.com.br' },
  { rx: /(^|\.)br-store\.acer\.com$/, loja: 'acer', pref: 'acr_', origin: 'https://br-store.acer.com' },
  { rx: /(^|\.)motorola\.com\.br$/, loja: 'motorola', pref: 'mot_', origin: 'https://www.motorola.com.br' },
  { rx: /(^|\.)shop\.samsung\.com(?:\.br)?$/, loja: 'samsung', pref: 'sam_', origin: 'https://shop.samsung.com.br' },
  { rx: /(^|\.)(?:magazineluiza|magazinevoce)\.com\.br$/, loja: 'magalu', pref: 'mgl_', origin: 'https://www.magazineluiza.com.br' },
  { rx: /(^|\.)umusicstore\.com$/, loja: 'umusic', pref: 'umu_', origin: 'https://www.umusicstore.com' },
  { rx: /(^|\.)klinestore\.com\.br$/, loja: 'klinestore', pref: 'kln_', origin: 'https://www.klinestore.com.br' },
  { rx: /(^|\.)hopescolor\.com$/, loja: 'hopescolor', pref: 'hpc_', origin: 'https://www.hopescolor.com' },
  { rx: /(^|\.)asiaticstore\.com\.br$/, loja: 'asiaticstore', pref: 'asi_', origin: 'https://www.asiaticstore.com.br' },
  { rx: /(^|\.)kpopandyoushop\.com\.br$/, loja: 'kpopandyoushop', pref: 'kyu_', origin: 'https://www.kpopandyoushop.com.br' },
  { rx: /(^|\.)kpopalbums\.com$/, loja: 'kpopalbums', pref: 'kpa_', origin: 'https://www.kpopalbums.com' },
  { rx: /(^|\.)kpopmerch\.com$/, loja: 'kpopmerch', pref: 'kpm_', origin: 'https://kpopmerch.com' },
  { rx: /(^|\.)ktown4u\.com$/, loja: 'ktown4u', pref: 'ktw_', origin: 'https://www.ktown4u.com' },
  { rx: /(^|\.)weverse\.io$/, loja: 'weverse', pref: 'wvs_', origin: 'https://shop.weverse.io' },
  { rx: /(^|\.)cokodive\.com$/, loja: 'cokodive', pref: 'ckd_', origin: 'https://www.cokodive.com' },
  { rx: /(^|\.)daebak\.co$/, loja: 'daebak', pref: 'dbk_', origin: 'https://daebak.co' },
  { rx: /(^|\.)cdjapan\.co\.jp$/, loja: 'cdjapan', pref: 'cdj_', origin: 'https://www.cdjapan.co.jp' },
  { rx: /(^|\.)yesasia\.com$/, loja: 'yesasia', pref: 'yes_', origin: 'https://www.yesasia.com' },
  { rx: /(^|\.)kpop1004\.com$/, loja: 'kpop1004', pref: 'k10_', origin: 'https://kpop1004.com' },
];

const ORIGEM_LOJA = LOJAS_CAMINHO.reduce((acc, l) => {
  if (!acc[l.loja]) acc[l.loja] = l.origin;
  return acc;
}, {});

function origemLoja(loja) {
  return ORIGEM_LOJA[loja] || '';
}

const IGNORAR_PATH_LOJA = /^\/(?:checkout|customer|cart|carrinho|minha-conta|login|cadastro|catalogsearch|busca|search)\b/i;

/**
 * Parser mínimo de URL (o sandbox do Code node do n8n não expõe o global URL).
 * Retorna { origin, hostname, pathname, search, hash } ou null.
 */
function parseUrl(s) {
  const m = String(s || '').trim().match(/^(https?):\/\/([^/?#\s:@]+)(?::\d+)?([^?#\s]*)(\?[^#\s]*)?(#\S*)?$/i);
  if (!m) return null;
  const hostname = m[2].toLowerCase();
  return { origin: `${m[1].toLowerCase()}://${hostname}`, hostname, pathname: m[3] || '/', search: m[4] || '', hash: m[5] || '' };
}

/**
 * Identifica a loja e um produto_id estável a partir da URL.
 * Retorna { loja, produto_id, url_limpa, erro? }.
 */
function identificar(url) {
  const u = parseUrl(url);
  if (!u) return { erro: 'URL inválida' };
  const host = u.hostname.replace(/^www\./, '');

  // Desembrulha deeplinks de redes de afiliados (Rakuten/LinkSynergy, Awin, RewardStyle)
  if (/^(click\.linksynergy\.com|awin1\.com|www\.awin1\.com|rstyle\.me)$/.test(host)) {
    const dest = (u.search.match(/[?&](?:murl|ued|dl)=([^&#]+)/i) || [])[1];
    if (dest) {
      try {
        const dec = decodeURIComponent(dest);
        if (/^https?:\/\//i.test(dec) && dec !== url) return identificar(dec);
      } catch (e) { /* mantém análise normal */ }
    }
  }

  if (/(^|\.)amazon\.com\.br$/.test(host)) {
    const m = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin)\/([A-Z0-9]{10})/i);
    if (!m) {
      if (/^\/(?:coupons|gp\/goldbox|deals)(?:\/|$)/i.test(u.pathname)) {
        return {
          loja: 'amazon',
          produto_id: 'amz_cupom_' + sha256Hex(u.pathname.toLowerCase()).slice(0, 10),
          url_limpa: 'https://www.amazon.com.br' + u.pathname,
        };
      }
      return { erro: 'Link da Amazon sem código do produto (/dp/ASIN)' };
    }
    const asin = m[1].toUpperCase();
    return { loja: 'amazon', produto_id: 'amz_' + asin, url_limpa: `https://www.amazon.com.br/dp/${asin}` };
  }
  if (/^(amzn\.to|a\.co|amzn\.com)$/.test(host)) {
    return { erro: 'Link curto da Amazon: envie o link completo da página do produto (com /dp/)' };
  }

  if (/(^|\.)shopee\.com\.br$/.test(host)) {
    // formatos: /produto-i.SHOPID.ITEMID, /product/SHOPID/ITEMID, /opaanlp/SHOPID/ITEMID, /universal-link?redir=… ou /loja/ITEMID
    const redir = (u.search.match(/[?&](?:redir|url)=([^&#]+)/i) || [])[1];
    if (redir && /^\/(?:universal-link|opaanlp)/i.test(u.pathname)) {
      try {
        const dec = decodeURIComponent(redir);
        if (/^https?:\/\//i.test(dec) && dec !== url) return identificar(dec);
      } catch (e) { /* segue tentativa pelo pathname */ }
    }
    const caminhoSh = u.pathname.replace(/^\/universal-link(?=\/)/i, '');
    const m = caminhoSh.match(/-i\.(\d+)\.(\d+)/) || caminhoSh.match(/\/(?:product|opaanlp)\/(\d+)\/(\d+)/);
    if (m) {
      return {
        loja: 'shopee',
        produto_id: `shp_${m[1]}_${m[2]}`,
        url_limpa: `https://shopee.com.br/product/${m[1]}/${m[2]}`,
      };
    }
    const mQsShop = (u.search.match(/[?&]shop_?id=(\d+)/i) || [])[1];
    const mQsItem = (u.search.match(/[?&]item_?id=(\d+)/i) || [])[1];
    if (mQsShop && mQsItem) {
      return {
        loja: 'shopee',
        produto_id: `shp_${mQsShop}_${mQsItem}`,
        url_limpa: `https://shopee.com.br/product/${mQsShop}/${mQsItem}`,
      };
    }
    const mLoja = caminhoSh.match(/^\/([a-z0-9_.-]{3,})\/(\d{6,})\/?$/i);
    if (mLoja && !/^(?:product|opaanlp|universal-link|search|cart|user|buyer|seller|daily_discover|flash_sale|campaigns|m|blog|help|legal)$/i.test(mLoja[1])) {
      const userLow = mLoja[1].toLowerCase();
      const kpopSh = (LOJAS_KPOP_SHOPEE || []).find((l) => l.username === userLow || (l.aliases || []).includes(userLow));
      if (kpopSh) {
        if (kpopSh.shop_id) {
          return {
            loja: 'shopee',
            produto_id: `shp_${kpopSh.shop_id}_${mLoja[2]}`,
            url_limpa: `https://shopee.com.br/product/${kpopSh.shop_id}/${mLoja[2]}`,
          };
        }
        return {
          loja: 'shopee',
          produto_id: `shp_${kpopSh.username}_${mLoja[2]}`,
          url_limpa: `https://shopee.com.br/${kpopSh.username}/${mLoja[2]}`,
        };
      }
      return {
        loja: 'shopee',
        produto_id: `shp_${userLow}_${mLoja[2]}`,
        url_limpa: `https://shopee.com.br/${mLoja[1]}/${mLoja[2]}`,
      };
    }
    if (/^\/(?:m\/)?(?:cupons(?:-diarios)?|voucher|frete-gratis)(?:\/|$)/i.test(u.pathname)) {
      return {
        loja: 'shopee',
        produto_id: 'shp_cupom_' + sha256Hex(u.pathname.toLowerCase()).slice(0, 10),
        url_limpa: 'https://shopee.com.br' + u.pathname,
      };
    }
    return { erro: 'Link da Shopee sem ids da loja/produto (use o link da página do produto)' };
  }
  if (/^(s\.shopee\.com\.br|shope\.ee|shp\.ee|br\.shp\.ee)$/.test(host)) {
    return { erro: 'Link curto da Shopee: envie o link completo da página do produto' };
  }

  if (/(^|\.)mercadoli(vre|bre)\.com(\.br)?$/.test(host) || /^(meli\.la|mercadolivre\.com)$/.test(host)) {
    // Desembrulha parede /gz/account-verification?go=https%3A%2F%2F...
    const goParam = (u.search.match(/[?&](?:go|redirect|url)=([^&#]+)/i) || [])[1];
    if (goParam && /^\/gz\//i.test(u.pathname)) {
      try {
        const decGo = decodeURIComponent(goParam);
        if (/^https?:\/\/[^/\s]*mercadoli(vre|bre)/i.test(decGo) && decGo !== url) return identificar(decGo);
      } catch (e) { /* segue fallback */ }
    }
    const m = (u.pathname + u.search + u.hash).match(/MLB(U)?-?(\d{6,})/i);
    const pid = m ? 'ml_MLB' + (m[1] ? 'U' : '') + m[2] : 'ml_' + sha256Hex(u.origin + u.pathname).slice(0, 12);
    const urlLimpa = /^\/gz\//i.test(u.pathname) && m
      ? `https://produto.mercadolivre.com.br/MLB-${m[2]}`
      : u.origin + u.pathname;
    return { loja: 'ml', produto_id: pid, url_limpa: urlLimpa };
  }

  if (/^(shein\.top|shein\.onelink\.me)$/.test(host)) {
    return { erro: 'Link curto da Shein: envie o link completo do produto' };
  }
  if (/(^|\.)shein\.com$/.test(host)) {
    const mGid = u.pathname.match(/-p-(\d+)(?:-cat-\d+)?\.html/i) || u.search.match(/[?&]goods_id=(\d+)/i);
    if (mGid) {
      const gid = mGid[1];
      return { loja: 'shein', produto_id: 'shn_' + gid, url_limpa: `https://br.shein.com/product-p-${gid}.html` };
    }
    if (host === 'onelink.shein.com') {
      return { erro: 'Link curto da Shein: envie o link completo do produto' };
    }
    if (u.pathname.length > 3 && !/^\/(?:cart|user|risk|search)\b/i.test(u.pathname)) {
      return {
        loja: 'shein',
        produto_id: 'shn_' + sha256Hex(u.origin + u.pathname).slice(0, 12),
        url_limpa: 'https://br.shein.com' + u.pathname,
      };
    }
    return { erro: 'Link da Shein sem código do produto' };
  }

  if (/^(vt\.tiktok\.com|vm\.tiktok\.com)$/.test(host) || (/(^|\.)tiktok\.com$/.test(host) && /^\/t\//i.test(u.pathname))) {
    return { erro: 'Link curto do TikTok Shop: envie o link completo do produto' };
  }
  if (/(^|\.)tiktok\.com$/.test(host)) {
    const mTk = u.pathname.match(/\/(?:view\/)?product\/(\d+)/i) || u.search.match(/[?&]product_id=(\d+)/i);
    if (mTk) {
      const tid = mTk[1];
      return { loja: 'tiktok', produto_id: 'tk_' + tid, url_limpa: `https://www.tiktok.com/view/product/${tid}` };
    }
    if (host === 'shop.tiktok.com' && u.pathname.length > 1) {
      return {
        loja: 'tiktok',
        produto_id: 'tk_' + sha256Hex(u.origin + u.pathname).slice(0, 12),
        url_limpa: u.origin + u.pathname,
      };
    }
  }

  if (/^(s\.click\.aliexpress\.com|a\.aliexpress\.com)$/.test(host)) {
    return { erro: 'Link curto do AliExpress: envie o link completo do produto' };
  }
  if (/(^|\.)aliexpress\.(?:com|us|ru)$/.test(host) && u.pathname.length > 1 && !IGNORAR_PATH_LOJA.test(u.pathname)) {
    const mAli = u.pathname.match(/\/(?:item|i)\/(\d{6,})\.html/i) || u.search.match(/[?&](?:productIds?|itemId)=(\d{6,})/i);
    if (mAli) {
      return {
        loja: 'aliexpress',
        produto_id: 'ali_' + mAli[1],
        url_limpa: `https://pt.aliexpress.com/item/${mAli[1]}.html`,
      };
    }
    return {
      loja: 'aliexpress',
      produto_id: 'ali_' + sha256Hex(u.pathname.toLowerCase()).slice(0, 12),
      url_limpa: 'https://pt.aliexpress.com' + u.pathname,
    };
  }

  if (/(^|\.)kabum\.com\.br$/.test(host) && u.pathname.length > 1 && !IGNORAR_PATH_LOJA.test(u.pathname)) {
    const mKbm = u.pathname.match(/\/produto\/(\d+)/i);
    return {
      loja: 'kabum',
      produto_id: mKbm ? 'kbm_' + mKbm[1] : 'kbm_' + sha256Hex(u.pathname.toLowerCase()).slice(0, 12),
      url_limpa: 'https://www.kabum.com.br' + u.pathname,
    };
  }
  if (/(^|\.)terabyteshop\.com\.br$/.test(host) && u.pathname.length > 1 && !IGNORAR_PATH_LOJA.test(u.pathname)) {
    const mTrb = u.pathname.match(/\/produto\/(\d+)/i);
    return {
      loja: 'terabyte',
      produto_id: mTrb ? 'trb_' + mTrb[1] : 'trb_' + sha256Hex(u.pathname.toLowerCase()).slice(0, 12),
      url_limpa: 'https://www.terabyteshop.com.br' + u.pathname,
    };
  }
  if (/(^|\.)pichau\.com\.br$/.test(host) && u.pathname.length > 1 && !IGNORAR_PATH_LOJA.test(u.pathname)) {
    return {
      loja: 'pichau',
      produto_id: 'pch_' + sha256Hex(u.pathname.toLowerCase()).slice(0, 12),
      url_limpa: 'https://www.pichau.com.br' + u.pathname,
    };
  }

  for (const l of LOJAS_CAMINHO) {
    if (l.rx.test(host) && u.pathname.length > 1 && !IGNORAR_PATH_LOJA.test(u.pathname)) {
      if (l.loja === 'magalu') {
        const mMgl = u.pathname.match(/\/p\/([a-z0-9]{6,})\b/i)
          || u.pathname.match(/\/divulgador\/oferta\/([a-z0-9]{6,})\b/i);
        if (mMgl) {
          const cod = mMgl[1].toLowerCase();
          return {
            loja: 'magalu',
            produto_id: 'mgl_' + cod,
            url_limpa: `https://www.magazineluiza.com.br/p/${cod}/`,
          };
        }
      }
      return {
        loja: l.loja,
        produto_id: l.pref + sha256Hex(u.pathname.toLowerCase()).slice(0, 12),
        url_limpa: l.origin + u.pathname,
      };
    }
  }

  return { loja: 'outra', produto_id: 'url_' + sha256Hex(host + u.pathname).slice(0, 12), url_limpa: u.origin + u.pathname };
}

function nomeLoja(loja) {
  return NOMES[loja] || NOMES.outra;
}

/** "na Amazon", "na Shopee", "no KaBuM!", "na Droga Raia", "na loja". */
function naLoja(loja) {
  if (loja === 'boticario') return 'no O Boticário';
  if (['ml', 'tiktok', 'kabum', 'aliexpress'].includes(loja)) return 'no ' + NOMES[loja];
  if (loja !== 'outra' && NOMES[loja]) return 'na ' + NOMES[loja];
  return 'na loja';
}

function urlCentralCupons(loja, cfg) {
  const links = (cfg && cfg.cupons && cfg.cupons.links) || {};
  return links[loja] || CENTRAL_CUPONS_LOJA[loja] || '';
}

const RE_HOST_IMAGEM_PROIBIDO = /(?:^|\.)(telesco\.pe|telegram\.org|t\.me|telegram\.me|telegram\.dog|pelando\.com\.br|gatry\.com|whatsapp\.net|whatsapp\.com|fbcdn\.net|facebook\.com|cdninstagram\.com|instagram\.com|twimg\.com|twitter\.com|x\.com|imgur\.com|ibb\.co|postimg\.cc|prntscr\.com|lightshot\.com|gyazo\.com|discordapp\.com|discordapp\.net|cuponomia\.com\.br|meliuz\.com\.br|lomadee\.com|nerdofertas\.com|ofertou\.ai|ytimg\.com|youtube\.com|youtu\.be|tiktokcdn\.com|pinimg\.com|pinterest\.com|reddit\.com|redd\.it|tenor\.com|giphy\.com|canaltech\.com\.br|tecmundo\.com\.br|adrenaline\.com\.br|tudocelular\.com)$/i;

const RE_PATH_IMAGEM_PROIBIDO = /(?:\/images\/G\/|_SR1910,1000|\/static\/u\/|watermark|xetdaspromocoes|canaltechofertas|ofertasdecomputador|nerdofertas|pelando|spacer\.gif|blank\.gif|1x1\.|\.svg(?:[?#]|$))/i;

const RE_HOST_IMAGEM_LOJA_OFICIAL = /(?:^|\.)(mlstatic\.com|media-amazon\.com|images-amazon\.com|ssl-images-amazon\.com|susercontent\.com|shopee\.com\.br|shopeemobile\.com|ltwebstatic\.com|alicdn\.com|aliexpress-media\.com|kabum\.com\.br|terabyteshop\.com\.br|pichau\.com\.br|mlcdn\.com\.br|zst\.com\.br|natura\.com(?:\.br)?|boticario\.com\.br|belezanaweb\.com\.br|epocacosmeticos\.com\.br|sephora\.com\.br|mahogany\.com\.br|creamy\.com\.br|ikesaki\.com\.br|drogaraia\.com\.br|drogasil\.com\.br|drogariaspacheco\.com\.br|drogariasaopaulo\.com\.br|drogariavenancio\.com\.br|oficialfarma\.com\.br|maxtitanium\.com\.br|panvel\.com|araujo\.com\.br|paguemenos\.com\.br|rihappy\.com\.br|alobebe\.com\.br|centauro\.com\.br|netshoes\.com\.br|nike\.com(?:\.br)?|adidas\.com(?:\.br)?|olympikus\.com\.br|mizuno\.com\.br|underarmour\.com\.br|farmrio\.com\.br|lojasrenner\.com\.br|cea\.com\.br|riachuelo\.com\.br|dafiti\.com\.br|zattini\.com\.br|hering\.com\.br|polishop\.com\.br|electrolux\.com\.br|brastemp\.com\.br|consul\.com\.br|acer\.com|motorola\.com\.br|samsung\.com(?:\.br)?|vteximg\.com\.br|vtexassets\.com|mitiendanube\.com|umusicstore\.com|klinestore\.com\.br|hopescolor\.com|asiaticstore\.com\.br|kpopandyoushop\.com\.br|kpopalbums\.com|kpopmerch\.com|cdn\.shopify\.com|ktown4u\.com|weverse\.io|phinf\.pstatic\.net|cokodive\.com|daebak\.co|cdjapan\.co\.jp|yesasia\.com|kpop1004\.com)$/i;

/**
 * Identifica imagens proibidas (canais do Telegram com @/watermark de terceiros, redes sociais,
 * fóruns concorrentes, banners genéricos da Amazon, avatares ou SVGs).
 */
function ehImagemProibida(url) {
  let s = String(url || '').trim().replace(/&amp;/gi, '&');
  if (!s) return true;
  if (s.startsWith('//')) s = 'https:' + s;
  const mW = s.match(/^https?:\/\/wsrv\.nl\/?\?(?:.*&)?url=([^&]+)/i);
  if (mW) {
    let alvo = '';
    try { alvo = decodeURIComponent(mW[1]); } catch (e) { alvo = mW[1]; }
    if (!/^https?:\/\//i.test(alvo)) alvo = 'https://' + alvo.replace(/^\/+/, '');
    s = alvo;
  }
  const u = parseUrl(s);
  if (!u) return true;
  const h = u.hostname.replace(/^www\./, '');
  if (RE_HOST_IMAGEM_PROIBIDO.test(h)) return true;
  if (RE_PATH_IMAGEM_PROIBIDO.test(u.pathname + u.search)) return true;
  return false;
}

/** Verifica se a URL pertence a um CDN oficial de loja ou comparador de catálogo (Zoom/Amazon/ML/etc.). */
function ehImagemLojaOficial(url) {
  const s = String(url || '').trim().replace(/&amp;/gi, '&');
  if (!s || ehImagemProibida(s)) return false;
  const u = parseUrl(s.startsWith('//') ? 'https:' + s : s);
  if (!u) return false;
  const h = u.hostname.replace(/^www\./, '');
  return RE_HOST_IMAGEM_LOJA_OFICIAL.test(h);
}

/**
 * URL de imagem pronta e segura para o Telegram (sendPhoto/prévia).
 * Bloqueia na raiz qualquer foto de canal de terceiros (telesco.pe, t.me, redes sociais, fóruns com @/watermark),
 * converte .webp do Mercado Livre (mlstatic.com) para .jpg nativo e limpa sufixos de baixa resolução da Amazon.
 */
function normalizarImagemOferta(url) {
  let s = String(url || '').trim().replace(/&amp;/gi, '&');
  if (s.startsWith('//')) s = 'https:' + s;
  if (!/^https?:\/\//i.test(s)) return '';
  const mW = s.match(/^https?:\/\/wsrv\.nl\/?\?(?:.*&)?url=([^&]+)/i);
  if (mW) {
    let alvo = '';
    try { alvo = decodeURIComponent(mW[1]); } catch (e) { alvo = mW[1]; }
    if (!/^https?:\/\//i.test(alvo)) alvo = 'https://' + alvo.replace(/^\/+/, '');
    s = alvo;
  }
  if (ehImagemProibida(s)) return '';
  const mPb = s.match(/^https?:\/\/(i\.promobit\.com\.br)(\/[^?#]*)/i);
  if (mPb) {
    let path = mPb[2];
    if (!/^\/(?:500|268|180|120|ar)\//i.test(path)) path = '/500' + path;
    return 'https://' + mPb[1] + path;
  }
  s = s.replace(/^http:\/\//i, 'https://');
  // Mercado Livre CDN: remove placeholder {sanitized_title} e converte .webp -> .jpg (aceito direto pelo sendPhoto)
  if (/^https:\/\/[^/?#]*mlstatic\.com\/D_/i.test(s)) {
    s = s.replace(/\{sanitized_title\}/gi, '').replace(/\.webp(?=$|[?#])/i, '.jpg');
  }
  // Amazon CDN: remove sufixos de miniatura (_AC_UL320_, _AC_SY300_SX300_, _AC_UF350,350_, _AC_SR160,160_) ou selo sobreposto (_BO30,255,255,255_) para foto limpa em alta resolução
  if (/^https:\/\/(?:m\.media-amazon\.com|images-na\.ssl-images-amazon\.com)\/images\/I\//i.test(s)) {
    s = s.replace(/\._(?:AC_(?:U[LSF]\d+|SR\d+,\d+|SY\d+_SX\d+|SX\d+_SY\d+|AA\d+|SS\d+)[^.]*|SX\d+_SY\d+[^.]*|SY\d+_SX\d+[^.]*|BO\d+[^.]*|SR\d+,\d+[^.]*|SS\d+[^.]*)_\.(jpg|jpeg|png)$/i, '.$1');
  }
  return s;
}

function logoLoja(loja, cfg) {
  const logos = (cfg && cfg.cupons && cfg.cupons.logos) || {};
  return logos[loja] || LOGO_LOJA_PADRAO[loja] || '';
}

module.exports = {
  identificar, nomeLoja, naLoja, origemLoja, parseUrl, PROGRAMAS_AFILIADO,
  CENTRAL_CUPONS_LOJA, LOGO_LOJA_PADRAO, urlCentralCupons, logoLoja,
  ehImagemProibida, ehImagemLojaOficial, normalizarImagemOferta,
};
