#!/usr/bin/env python3
"""Cenários de ponta a ponta contra o n8n local (rode antes ./rodar.sh). Sai com erro se algo falhar."""
import json, os, re, sqlite3, subprocess, sys, time, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(AQUI, 'tmp')
LOG = os.path.join(TMP, 'mock-log.jsonl')
SEGREDO = open(os.path.join(TMP, 'segredo')).read().strip()
DB = os.path.join(TMP, 'home', '.n8n', 'database.sqlite')
falhas = []


def post(url, corpo, segredo=SEGREDO):
    req = urllib.request.Request(url, data=json.dumps(corpo).encode(), method='POST', headers={
        'content-type': 'application/json', 'x-telegram-bot-api-secret-token': segredo})
    urllib.request.urlopen(req).read()


def update(u, segredo=SEGREDO, espera=7, bot=None):
    # bot='grupo': update recebido pelo bot publicador (webhook registrado com ?bot=grupo)
    post('http://127.0.0.1:5678/webhook/telegram-ofertas' + ('?bot=' + bot if bot else ''), u, segredo)
    time.sleep(espera)


def hook(wf, espera=10):
    post(f'http://127.0.0.1:5678/webhook/teste-{wf}', {})
    time.sleep(espera)


def limpar_log():
    open(LOG, 'w').close()


def chamadas():
    cs = [json.loads(l) for l in open(LOG) if l.strip()]
    for c in cs:
        c.setdefault('payload', {})
        c.setdefault('token', '')
        c.setdefault('metodo', '')
    return cs


def msg(texto, de=111):
    return {'update_id': 1, 'message': {'message_id': 1, 'text': texto, 'chat': {'id': de, 'type': 'private'}, 'from': {'id': de}}}


def clique(acao, oferta_id, de=111, msg_id=50):
    return {'update_id': 2, 'callback_query': {'id': 'cb', 'data': f'{acao}|{oferta_id}', 'from': {'id': de},
                                               'message': {'message_id': msg_id, 'chat': {'id': de}}}}


def checar(nome, cond):
    print(('  ok   ' if cond else '  FALHA ') + nome)
    if not cond:
        falhas.append(nome)


def id_do_card(cs):
    for c in reversed(cs):
        for linha in c.get('payload', {}).get('reply_markup', {}).get('inline_keyboard', []):
            for b in linha:
                if b['callback_data'][:2] in ('a|', 'e|'):
                    return b['callback_data'].split('|')[1]


def linhas(tabela, where=''):
    c = sqlite3.connect(DB)
    tid = c.execute('select id from data_table where name = ?', (tabela,)).fetchone()[0]
    c.row_factory = sqlite3.Row
    return [dict(r) for r in c.execute(f'select * from "data_table_user_{tid}" {where}')]


print('0) Setup arrumou o grupo (descrição, Conversa, textos fixados, tópicos fechados)')
cs = chamadas()
met = [c['metodo'] for c in cs if c.get('token') == 'TOKGRUPO']
topicos_cfg = sorted(int(r['valor']) for r in linhas('bfx_config', "where chave like 'topico.%' and valor != ''"))
checar('descrição e General renomeado', 'setChatDescription' in met and any(c['metodo'] == 'editGeneralForumTopic' and c['payload'].get('name') == '💬 Conversa' for c in cs))
checar('7 mensagens enviadas e fixadas', met.count('pinChatMessage') == 7 and len([c for c in cs if c['metodo'] == 'sendMessage' and c['token'] == 'TOKGRUPO']) == 7)
checar('5 tópicos de oferta fechados', sorted(c['payload']['message_thread_id'] for c in cs if c['metodo'] == 'closeForumTopic') == topicos_cfg and len(topicos_cfg) == 5)
checar('grupo.textos = ok', linhas('bfx_config', "where chave = 'grupo.textos'")[0]['valor'] == 'ok')
checar('resumo do grupo para os admins', any('Grupo arrumado' in c['payload'].get('text', '') for c in cs))
checar('IDs das mensagens gravados', len(json.loads(linhas('bfx_config', "where chave = 'grupo.mensagens'")[0]['valor'])) == 7)

print('0b) Setup de novo: com mensagem fixada não duplica; modo atualizar só edita')
def config_set(chave, valor):
    c = sqlite3.connect(DB)
    tid = c.execute('select id from data_table where name = ?', ('bfx_config',)).fetchone()[0]
    c.execute(f'update "data_table_user_{tid}" set valor = ? where chave = ?', (valor, chave))
    c.commit()
config_set('grupo.textos', 'pendente')
limpar_log()
hook('wfSetup000000001', espera=12)
cs = chamadas()
checar('pendente + grupo já fixado: nada enviado', not any(c['metodo'] in ('sendMessage', 'pinChatMessage') and c['token'] == 'TOKGRUPO' for c in cs))
checar('setup tudo ok: sem mensagem no privado', not any(c['metodo'] == 'sendMessage' for c in cs))
config_set('grupo.textos', 'atualizar')
limpar_log()
hook('wfSetup000000001', espera=70)
cs = chamadas()
checar('atualizar: 7 edições e nada novo', len([c for c in cs if c['metodo'] == 'editMessageText']) == 7 and not any(c['metodo'] in ('pinChatMessage', 'closeForumTopic') for c in cs) and not any(c['metodo'] == 'sendMessage' and c['token'] == 'TOKGRUPO' for c in cs))
checar('atualizar: volta para ok', linhas('bfx_config', "where chave = 'grupo.textos'")[0]['valor'] == 'ok')

print('1) Amazon: /oferta → card → ⭐ Aprovar + Top')
limpar_log()
update(msg('/oferta casa\nhttps://www.amazon.com.br/Air-Fryer/dp/B0ABCDEF12?ref=x\nAir Fryer Mondial 4L\npreço 349,90\n'
           'ref90 399,90 https://comparador.example/h\nimg https://img.example/af.jpg'))
cs = chamadas()
oid = id_do_card(cs)
checar('card enviado com botões de aprovação', oid and any('a|' + oid == b['callback_data'] for c in cs
       for l in c['payload'].get('reply_markup', {}).get('inline_keyboard', []) for b in l))
limpar_log()
update(clique('t', oid), espera=10)
cs = chamadas()
grupo = [c for c in cs if c['token'] == 'TOKGRUPO' and c['metodo'] == 'sendMessage']
checar('2 posts no grupo (categoria + Top do Dia)', len(grupo) == 2)
checar('tópicos certos', sorted(c['payload'].get('message_thread_id') for c in grupo) == sorted([
    int(r['valor']) for r in linhas('bfx_config', "where chave in ('topico.casa','topico.top')")]))
textos = '\n'.join(c['payload'].get('text', '') for c in cs)
checar('4 tags distintas da Amazon nos textos', all(f'tag=marca-casa{p}-20' in textos for p in ['tg', 'wac', 'x']))
checar('aviso de afiliado no post', 'Contém link de afiliado' in grupo[0]['payload']['text'])
of = linhas('bfx_ofertas', f"where oferta_id = '{oid}'")[0]
checar('status aprovada e top', of['status'] == 'aprovada' and of['top'] in (1, True))
checar('posts gravados', len(linhas('bfx_posts', f"where oferta_id = '{oid}'")) == 2)

print('1b) Limite do Telegram: post barrado é reenviado depois de esperar')
limpar_log()
update(msg('/oferta casa\nhttps://www.amazon.com.br/Ventilador/dp/B0VENTILA1\nVentilador Teste\npreço 99,90\nref90 129,90 https://comparador.example/p'))
oid2 = id_do_card(chamadas())
urllib.request.urlopen('http://127.0.0.1:8787/mock/barrar').read()
limpar_log()
update(clique('a', oid2), espera=14)
cs = chamadas()
envios = [c for c in cs if c['token'] == 'TOKGRUPO' and c['metodo'] == 'sendMessage']
checar('post barrado reenviado (2 tentativas)', len(envios) == 2)
checar('post gravado e sem alerta de falha', len(linhas('bfx_posts', f"where oferta_id = '{oid2}'")) == 1 and not any('Falhas' in c['payload'].get('text', '') for c in cs))

print('1c) Limite do Telegram duas vezes: oferta fica "falha" e o admin é avisado')
limpar_log()
update(msg('/oferta casa\nhttps://www.amazon.com.br/Cafeteira/dp/B0CAFETE01\nCafeteira Teste\npreço 89,90\nref90 119,90 https://comparador.example/c'))
oid3 = id_do_card(chamadas())
urllib.request.urlopen('http://127.0.0.1:8787/mock/barrar/2').read()
limpar_log()
update(clique('a', oid3), espera=14)
cs = chamadas()
checar('status falha (não fica aprovada sem post)', linhas('bfx_ofertas', f"where oferta_id = '{oid3}'")[0]['status'] == 'falha')
checar('admins avisados e card marcado', len([c for c in cs if 'NÃO saiu no grupo' in c['payload'].get('text', '')]) == 2
       and any(c['metodo'] == 'editMessageReplyMarkup' and 'Não saiu' in json.dumps(c['payload'], ensure_ascii=False) for c in cs))
checar('nenhum post gravado', linhas('bfx_posts', f"where oferta_id = '{oid3}'") == [])

print('2) Clique repetido não publica de novo')
limpar_log()
update(clique('a', oid, de=222))
cs = chamadas()
checar('só responde "já está aprovada"', [c['metodo'] for c in cs] == ['answerCallbackQuery'] and 'aprovada' in cs[0]['payload']['text'])

print('2b) Dois cliques ao mesmo tempo publicam uma vez só')
limpar_log()
update(msg('/oferta casa\nhttps://www.amazon.com.br/Liquidificador/dp/B0LIQUID01\nLiquidificador Teste\npreço 79,90\nref90 99,90 https://comparador.example/l'))
oid4 = id_do_card(chamadas())
limpar_log()
import threading
ts_ = [threading.Thread(target=post, args=('http://127.0.0.1:5678/webhook/telegram-ofertas', clique('a', oid4, de=d))) for d in (111, 222)]
for t in ts_: t.start()
for t in ts_: t.join()
time.sleep(14)
cs = chamadas()
checar('um post só no grupo', len([c for c in cs if c['token'] == 'TOKGRUPO' and c['metodo'] == 'sendMessage']) == 1)
checar('oferta aprovada com 1 post', linhas('bfx_ofertas', f"where oferta_id = '{oid4}'")[0]['status'] == 'aprovada' and len(linhas('bfx_posts', f"where oferta_id = '{oid4}'")) == 1)

print('3) Segredo errado é ignorado')
limpar_log()
update(msg('/id', de=999), segredo='errado', espera=4)
checar('nenhuma chamada ao Telegram', chamadas() == [])

print('4) Shopee manual: links curtos assinados com sub-IDs')
limpar_log()
update(msg('/oferta beleza\nhttps://shopee.com.br/Kit-i.987.654321\nKit Perfume\npreço 149\nref90 160 https://f'))
sid = id_do_card(chamadas())
limpar_log()
update(clique('r', sid), espera=12)
cs = chamadas()
sh = [c for c in cs if c['api'] == 'shopee']
checar('4 chamadas generateShortLink válidas', len(sh) == 4 and all(c['valido'] for c in sh))
checar('sub-IDs por plataforma', sorted(c['variables']['subIds'][2] for c in sh) == ['tg', 'wac', 'wag', 'x'])
checar('texto do grupo WhatsApp com link wag', any('ALERTA DE PREÇO' in c['payload'].get('text', '') and '-wag-' in c['payload']['text'] for c in cs))

print('5) Convite nomeado + entrada/saída')
limpar_log()
update(msg('/convite casa meta_casa_v1'))
checar('createChatInviteLink com nome', any(c['metodo'] == 'createChatInviteLink' and c['payload']['name'] == 'meta_casa_v1' for c in chamadas()))
gid = int(linhas('bfx_config', "where chave = 'grupo_id'")[0]['valor'])
membro = lambda antes, depois, link: {'update_id': 3, 'chat_member': {
    'chat': {'id': gid, 'type': 'supergroup'}, 'from': {'id': 555}, 'date': 1,
    'old_chat_member': {'status': antes, 'user': {'id': 555}}, 'new_chat_member': {'status': depois, 'user': {'id': 555}},
    **({'invite_link': {'invite_link': 'https://t.me/+x', 'name': link, 'creator': {'id': 1}, 'creates_join_request': False,
                        'is_primary': False, 'is_revoked': False}} if link else {})}}
update(membro('left', 'member', 'meta_casa_v1'), espera=4)
update(membro('member', 'left', None), espera=4)
ent = linhas('bfx_entradas')
checar('entrada e saída gravadas', [e['tipo'] for e in ent][-2:] == ['entrada', 'saida'] and ent[-2]['convite_nome'] == 'meta_casa_v1')
checar('sem ID do usuário gravado', all('555' not in json.dumps(e) for e in ent))

print('6) Coleta Shopee e relatório')
limpar_log()
hook('wfShopee00000001', espera=15)
cs = chamadas()
checar('coleta assinada', any(c['api'] == 'shopee' for c in cs) and all(c['valido'] for c in cs if c['api'] == 'shopee'))
checar('card da candidata sem selo → só Editar/Rejeitar', any(
    [b['text'] for l in c['payload'].get('reply_markup', {}).get('inline_keyboard', []) for b in l] == ['✏️ Editar', '❌ Rejeitar'] for c in cs))
limpar_log()
hook('wfRelat000000001', espera=8)
rel = [c for c in chamadas() if c['metodo'] == 'sendMessage']
checar('relatório para os 2 admins', len(rel) == 2 and 'meta_casa_v1' in rel[0]['payload']['text'])

print('7) Servidor local: túnel novo → URL gravada e webhook refeito')
limpar_log()
post('http://127.0.0.1:5678/webhook/oferto-tunel', {'url': 'https://exemplo-novo.trycloudflare.com/'})
time.sleep(12)
cs = chamadas()
sw = [c for c in cs if c['metodo'] == 'setWebhook']
URL_TUNEL = 'https://exemplo-novo.trycloudflare.com/webhook/telegram-ofertas'
checar('setWebhook com a URL do túnel (publicador com ?bot=grupo)', len(sw) == 2 and all(
    c['payload'].get('url') == (URL_TUNEL + '?bot=grupo' if c['token'] == 'TOKGRUPO' else URL_TUNEL) for c in sw))
checar('n8n_webhook_url gravada', any(r['valor'] == 'https://exemplo-novo.trycloudflare.com/webhook/telegram-ofertas' for r in linhas('bfx_config', "where chave = 'n8n_webhook_url'")))
checar('segredo do webhook mantido', all(c['payload'].get('secret_token') == SEGREDO for c in sw))
checar('arrumação do grupo não repetida', not any(c['metodo'] == 'setChatDescription' for c in cs))

print('7b) Túnel com domínio não permitido é recusado')
limpar_log()
post('http://127.0.0.1:5678/webhook/oferto-tunel', {'url': 'https://atacante.example.com'})
time.sleep(6)
checar('nenhum setWebhook', not any(c['metodo'] == 'setWebhook' for c in chamadas()))
checar('n8n_webhook_url mantida', linhas('bfx_config', "where chave = 'n8n_webhook_url'")[0]['valor'] == 'https://exemplo-novo.trycloudflare.com/webhook/telegram-ofertas')
erros_tunel = sqlite3.connect(DB).execute("select count(*) from execution_entity where workflowId = 'wfTunel000000001' and status = 'error'").fetchone()[0]
checar('recusa registrada como erro no 90', erros_tunel == 1)

print('8) Avisos automáticos do grupo são apagados')
limpar_log()
update({'update_id': 9, 'message': {'message_id': 901, 'chat': {'id': -1001234567890, 'type': 'supergroup'}, 'from': {'id': 555}, 'new_chat_members': [{'id': 555}]}})
update({'update_id': 10, 'message': {'message_id': 902, 'chat': {'id': -1001234567890, 'type': 'supergroup'}, 'from': {'id': 555}, 'message_thread_id': 5, 'forum_topic_created': {'name': 'x'}}})
dl = [c for c in chamadas() if c['metodo'] == 'deleteMessage']
checar('apaga "entrou" com o bot publicador', len(dl) == 1 and dl[0]['payload']['message_id'] == 901 and dl[0]['token'] == 'TOKGRUPO')

print('9s) Servidor local: saúde do webhook (workflow 91)')
def saude():
    req = urllib.request.Request('http://127.0.0.1:5678/webhook/oferto-saude', data=b'{}', method='POST', headers={'content-type': 'application/json'})
    r = json.loads(urllib.request.urlopen(req, timeout=60).read())
    time.sleep(2)
    return r
def avisos():
    return [c for c in chamadas() if c['metodo'] == 'sendMessage']
limpar_log()
r = saude()
checar('tudo ok: responde ok e não avisa ninguém', r.get('ok') is True and r.get('problemas') == [] and avisos() == [])
checar('consulta getWebhookInfo dos 2 bots', sorted(c['token'] for c in chamadas() if c['metodo'] == 'getWebhookInfo') == ['TOKADMIN', 'TOKGRUPO'])
urllib.request.urlopen('http://127.0.0.1:8787/mock/erro-webhook/on').read()
limpar_log()
r = saude()
av = avisos()
checar('erro de entrega: alerta os 2 admins', r.get('problemas') == ['erro_admin', 'erro_grupo'] and len(av) == 2 and 'problema no bot' in av[0]['payload']['text'])
checar('estado do alerta gravado na bfx_config', 'erro_admin' in json.loads(linhas('bfx_config', "where chave = 'saude.ultimo_alerta'")[0]['valor']))
limpar_log()
saude()
checar('mesmo problema 5 min depois: sem alerta repetido', avisos() == [])
urllib.request.urlopen('http://127.0.0.1:8787/mock/erro-webhook/off').read()
limpar_log()
r = saude()
av = avisos()
checar('resolvido: avisa os admins e limpa o estado', r.get('ok') is True and len(av) == 2 and 'resolvido' in av[0]['payload']['text']
       and linhas('bfx_config', "where chave = 'saude.ultimo_alerta'")[0]['valor'] == '{}')
config_set('n8n_webhook_url', 'https://outro.trycloudflare.com/webhook/telegram-ofertas')
limpar_log()
r = saude()
checar('webhook com URL diferente da config: alerta', r.get('problemas') == ['url_admin', 'url_grupo'] and len(avisos()) == 2)
config_set('n8n_webhook_url', 'https://exemplo-novo.trycloudflare.com/webhook/telegram-ofertas')

def grupo_msg(texto, de=555, mid=950):
    return {'update_id': 20, 'message': {'message_id': mid, 'text': texto, 'chat': {'id': gid, 'type': 'supergroup'}, 'from': {'id': de}}}


print('9) /start do membro no bot publicador: responde pelo mesmo bot, com convite bot_start')
limpar_log()
update(msg('/start', de=777), bot='grupo')
cs = chamadas()
resp = [c for c in cs if c['metodo'] == 'sendMessage']
checar('resposta pelo bot publicador', len(resp) == 1 and resp[0]['token'] == 'TOKGRUPO' and resp[0]['payload']['chat_id'] == 777)
checar('convite bot_start criado e no texto', any(c['metodo'] == 'createChatInviteLink' and c['payload']['name'] == 'bot_start' for c in cs)
       and 'https://t.me/+CONVITEbot_start' in resp[0]['payload']['text'])
checar('links dos tópicos no texto', resp[0]['payload']['text'].count('https://t.me/c/1234567890/') == 5)
checar('nada pelo bot de aprovação', not any(c['token'] == 'TOKADMIN' for c in cs))
limpar_log()
update(msg('/start', de=778), bot='grupo')
cs = chamadas()
checar('2º /start reaproveita o convite', not any(c['metodo'] == 'createChatInviteLink' for c in cs) and any(
    c['metodo'] == 'sendMessage' and 'CONVITEbot_start' in c['payload']['text'] for c in cs))
checar('/start gravado em bfx_entradas', len(linhas('bfx_entradas', "where tipo = 'start' and convite_nome = 'sem_payload'")) == 2)

print('9b) /start beleza_meta1: boas-vindas do tópico, convite da campanha e botão do tópico')
limpar_log()
update(msg('/start beleza_meta1', de=779), bot='grupo')
cs = chamadas()
resp = [c for c in cs if c['metodo'] == 'sendMessage']
tb = int(linhas('bfx_config', "where chave = 'topico.beleza'")[0]['valor'])
bt = resp[0]['payload'].get('reply_markup', {}).get('inline_keyboard', []) if resp else []
checar('convite beleza_meta1 criado', any(c['metodo'] == 'createChatInviteLink' and c['payload']['name'] == 'beleza_meta1' for c in cs))
checar('boas-vindas de Beleza pelo publicador', len(resp) == 1 and resp[0]['token'] == 'TOKGRUPO' and 'Bem-vindo às ofertas de Beleza' in resp[0]['payload']['text'])
checar('botões Entrar e Abrir o tópico', len(bt) == 2 and bt[0][0]['url'] == 'https://t.me/+CONVITEbeleza_meta1'
       and bt[1][0]['url'] == f'https://t.me/c/1234567890/{tb}' and bt[1][0]['text'].startswith('Abrir'))
checar('start com payload gravado', len(linhas('bfx_entradas', "where tipo = 'start' and convite_nome = 'beleza_meta1'")) == 1
       and len(linhas('bfx_convites', "where nome = 'beleza_meta1'")) == 1)
checar('start sem ID do usuário', all('779' not in json.dumps(e) for e in linhas('bfx_entradas')))

print('9c) /links no bot de aprovação (@ do publicador gravado pelo setup)')
limpar_log()
update(msg('/links'))
cs = chamadas()
checar('links de divulgação por categoria', len(cs) == 1 and cs[0]['token'] == 'TOKADMIN' and all(
    f'https://t.me/teste_bot?start={k}' in cs[0]['payload']['text'] for k in ['top', 'casa', 'beleza', 'bebe', 'tech']))
limpar_log()
update(msg('/id', de=780), bot='grupo')
cs = chamadas()
checar('/id no publicador responde pelo publicador', len(cs) == 1 and cs[0]['token'] == 'TOKGRUPO' and 'Seu ID: 780' in cs[0]['payload']['text'])

print('10) ⭐ Mandar ao Top depois de publicada (limite 5/dia)')
limpar_log()
update(clique('p', oid2), espera=8)
cs = chamadas()
top = int(linhas('bfx_config', "where chave = 'topico.top'")[0]['valor'])
envio = [c for c in cs if c['token'] == 'TOKGRUPO' and c['metodo'] == 'sendMessage']
checar('post no Top, silencioso', len(envio) == 1 and envio[0]['payload'].get('message_thread_id') == top and envio[0]['payload'].get('disable_notification') is True)
checar('resposta com contagem do dia', any(c['metodo'] == 'answerCallbackQuery' and '2/5' in c['payload'].get('text', '') for c in cs))
checar('post do Top gravado e oferta marcada top', len(linhas('bfx_posts', f"where oferta_id = '{oid2}' and categoria = 'top'")) == 1
       and linhas('bfx_ofertas', f"where oferta_id = '{oid2}'")[0]['top'] in (1, True))
# completa 5 no Top de hoje e tenta mais uma (a oferta Shopee publicada no cenário 4)
db = sqlite3.connect(DB)
tid = db.execute("select id from data_table where name = 'bfx_posts'").fetchone()[0]
for i in range(3):
    db.execute(f'insert into "data_table_user_{tid}" (oferta_id, plataforma, categoria, message_id, link, ts, data) values (?, ?, ?, ?, ?, ?, ?)',
               (f'ofalsa{i}', 'tg', 'top', 9000 + i, '', time.time() * 1000, ''))
db.commit()
limpar_log()
update(clique('p', sid), espera=8)
cs = chamadas()
checar('acima do limite: só o aviso', [c['metodo'] for c in cs] == ['answerCallbackQuery'] and '5/5' in cs[0]['payload']['text'] and cs[0]['payload'].get('show_alert'))

print('11) ⛔ Encerrar: edita os posts do grupo e tira o botão')
limpar_log()
update(clique('z', oid), espera=8)
cs = chamadas()
eds = [c for c in cs if c['metodo'] == 'editMessageText']
ids_posts = sorted(int(r['message_id']) for r in linhas('bfx_posts', f"where oferta_id = '{oid}'"))
checar('2 posts editados pelo publicador', len(eds) == 2 and all(c['token'] == 'TOKGRUPO' for c in eds)
       and sorted(c['payload']['message_id'] for c in eds) == ids_posts)
checar('texto de encerrada e sem botão', all('encerrada' in c['payload']['text'].lower() and c['payload']['reply_markup'] == {'inline_keyboard': []} for c in eds))
checar('status encerrada', linhas('bfx_ofertas', f"where oferta_id = '{oid}'")[0]['status'] == 'encerrada')

print('12) Antispam no 💬 Conversa')
limpar_log()
update(grupo_msg('entra no meu grupo https://t.me/outrogrupo'), bot='grupo', espera=5)
update(grupo_msg('grupo oficial t.me/outrogrupo', de=111, mid=951), bot='grupo', espera=5)
cs = chamadas()
checar('apaga link de outro grupo (só do membro)', [(c['token'], c['metodo'], c['payload'].get('message_id')) for c in cs] == [('TOKGRUPO', 'deleteMessage', 950)])

print('13) Sugestão de membro (link de loja)')
limpar_log()
update(grupo_msg('achei barato https://www.amazon.com.br/Fone/dp/B0FONE0001?ref=x', de=556, mid=960), bot='grupo', espera=6)
cs = chamadas()
valeu = [c for c in cs if c['token'] == 'TOKGRUPO' and c['metodo'] == 'sendMessage']
avisos = [c for c in cs if c['token'] == 'TOKADMIN' and c['metodo'] == 'sendMessage']
checar('"Valeu!" no grupo, respondendo a mensagem', len(valeu) == 1 and valeu[0]['payload']['text'].startswith('Valeu!')
       and valeu[0]['payload']['reply_parameters']['message_id'] == 960)
checar('aviso aos 2 admins com /oferta pré-preenchido', len(avisos) == 2 and all('/oferta CATEGORIA\nhttps://www.amazon.com.br/dp/B0FONE0001' in c['payload']['text'] for c in avisos))
checar('não apagou a sugestão', not any(c['metodo'] == 'deleteMessage' for c in cs))
limpar_log()
update(grupo_msg('e essa https://shopee.com.br/Kit-i.5.6', de=556, mid=961), bot='grupo', espera=6)
cs = chamadas()
checar('2ª sugestão do mesmo membro: sem novo "Valeu!", admins avisados', not any(c['token'] == 'TOKGRUPO' for c in cs)
       and len([c for c in cs if c['token'] == 'TOKADMIN']) == 2)

def card_de(cs, oferta_id):
    for c in cs:
        if c['metodo'] == 'sendMessage' and f'Oferta {oferta_id}</b>' in c['payload'].get('text', ''):
            return c['payload']
    return {}


print('14) Keepa: /oferta só com o link da Amazon')
limpar_log()
update(msg('/oferta casa https://www.amazon.com.br/Air-Fryer/dp/B0TESTE123?ref=x'), espera=9)
cs = chamadas()
kp = [c for c in cs if c['api'] == 'keepa']
checar('1 consulta à Keepa com domínio 12 e stats 90', len(kp) == 1 and kp[0]['asin'] == 'B0TESTE123' and kp[0]['domain'] == '12' and kp[0]['stats'] == '90' and kp[0]['buybox'] is None)
kid = id_do_card(cs)
card = card_de(cs, kid)
txt = card.get('text', '')
checar('card com título, preço e ref90 da Keepa', 'Air Fryer 4L' in txt and 'R$ 299,90' in txt and 'Menor 90d: R$ 279,90' in txt and 'fonte: Keepa · consultado' in txt)
checar('card avisa que o preço veio da Keepa', '💡 preço da Keepa (' in txt and 'confira na loja antes de aprovar' in txt)
checar('imagem da Keepa na prévia', card.get('link_preview_options', {}).get('url') == 'https://m.media-amazon.com/images/I/71abcXYZ.jpg')
of = linhas('bfx_ofertas', f"where oferta_id = '{kid}'")
checar('oferta gravada com dados da Keepa', len(of) == 1 and of[0]['titulo'] == 'Air Fryer 4L' and of[0]['preco'] == 299.9 and of[0]['ref90'] == 279.9 and of[0]['selo'] == 'acima')
pr = linhas('bfx_precos', "where produto_id = 'amz_B0TESTE123'")
checar('bfx_precos: ref90 da Keepa e preço atual como coleta', sorted((r['fonte'], r['preco'], r['fonte_url']) for r in pr) == [('coleta', 299.9, ''), ('ref90', 279.9, 'keepa')])

print('14b) Keepa sem tokens: card sai com o que o admin digitou e avisa')
limpar_log()
update(msg('/oferta casa https://www.amazon.com.br/dp/B0SEMTOKEN\nPanela Teste\npreço 99,90'), espera=9)
cs = chamadas()
sid2 = id_do_card(cs)
txt = card_de(cs, sid2).get('text', '')
checar('consultou a Keepa', any(c['api'] == 'keepa' and c['asin'] == 'B0SEMTOKEN' for c in cs))
checar('card com aviso "Keepa sem tokens"', 'Panela Teste' in txt and 'R$ 99,90' in txt and '⚠️ Keepa sem tokens' in txt and '💡' not in txt)
limpar_log()
update(msg('/oferta casa https://www.amazon.com.br/dp/B0SEMTOKEN'), espera=9)
cs = chamadas()
checar('sem tokens e sem preço: pede as linhas que faltam', any('Keepa sem tokens (recarrega em ~2 min): falta o título e o preço' in c['payload'].get('text', '') for c in cs) and not id_do_card(cs))

print('14c) Tudo digitado: não consulta a Keepa')
limpar_log()
update(msg('/oferta casa\nhttps://www.amazon.com.br/dp/B0TESTE123\nAir Fryer manual\npreço 269,90\nref90 279,90 https://fonte\nimg https://img.example/a.jpg'))
cs = chamadas()
checar('sem chamada à Keepa e card com os valores do admin', not any(c['api'] == 'keepa' for c in cs) and 'R$ 269,90' in card_de(cs, id_do_card(cs)).get('text', ''))

print('15) ref90 respondendo ao card (Shopee)')
limpar_log()
update(msg('/oferta beleza\nhttps://shopee.com.br/Kit-i.987.111222\nKit Resposta\npreço 149'))
cs = chamadas()
rid = id_do_card(cs)
card0 = card_de(cs, rid)
checar('card inicial sem selo (só Editar/Rejeitar)', [b['text'] for l in card0.get('reply_markup', {}).get('inline_keyboard', []) for b in l] == ['✏️ Editar', '❌ Rejeitar'])
plano = re.sub(r'<[^>]+>', '', card0.get('text', '')).replace('&amp;', '&')
limpar_log()
update({'update_id': 11, 'message': {'message_id': 77, 'text': '159,90 https://comparador.example/kit', 'chat': {'id': 111, 'type': 'private'},
                                     'from': {'id': 111}, 'reply_to_message': {'message_id': 300, 'text': plano, 'chat': {'id': 111, 'type': 'private'}}}})
cs = chamadas()
nid = id_do_card(cs)
card1 = card_de(cs, nid)
checar('card novo com selo e botão de aprovar', nid and nid != rid and '✅ Desconto real' in card1.get('text', '') and any(
    b['callback_data'] == 'a|' + nid for l in card1.get('reply_markup', {}).get('inline_keyboard', []) for b in l))
checar('card novo com ref90 e fonte da resposta', 'Menor 90d: R$ 159,90' in card1.get('text', '') and 'comparador.example/kit' in card1.get('text', ''))
checar('card antigo perde os botões', any(c['metodo'] == 'editMessageReplyMarkup' and c['payload'].get('message_id') == 300 for c in cs))
checar('oferta antiga editada e nova pendente', linhas('bfx_ofertas', f"where oferta_id = '{rid}'")[0]['status'] == 'editada'
       and linhas('bfx_ofertas', f"where oferta_id = '{nid}'")[0]['status'] == 'pendente')
limpar_log()
update({'update_id': 12, 'message': {'message_id': 78, 'text': 'quanto?', 'chat': {'id': 111, 'type': 'private'}, 'from': {'id': 111},
                                     'reply_to_message': {'message_id': 300, 'text': plano}}}, espera=4)
checar('resposta sem valor explica o formato', any('responda ao card' in c['payload'].get('text', '') for c in chamadas()))

c = sqlite3.connect(DB)
# A recusa do túnel (7b) é um erro esperado.
erros = c.execute("select count(*) from execution_entity where status != 'success' and not (workflowId = 'wfTunel000000001' and status = 'error')").fetchone()[0]
checar('nenhuma execução com erro no n8n', erros == 0)

print(f'\n{len(falhas)} falha(s)' if falhas else '\nTudo certo.')
sys.exit(1 if falhas else 0)
