#!/usr/bin/env python3
"""Cenários de ponta a ponta contra o n8n local (rode antes ./rodar.sh). Sai com erro se algo falhar."""
import json, os, sqlite3, subprocess, sys, time, urllib.request

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


def update(u, segredo=SEGREDO, espera=7):
    post('http://127.0.0.1:5678/webhook/telegram-ofertas', u, segredo)
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
checar('resumo do grupo para os admins', any('Arrumação do grupo' in c['payload'].get('text', '') for c in cs))

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

print('2) Clique repetido não publica de novo')
limpar_log()
update(clique('a', oid, de=222))
cs = chamadas()
checar('só responde "já está aprovada"', [c['metodo'] for c in cs] == ['answerCallbackQuery'] and 'aprovada' in cs[0]['payload']['text'])

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
checar('texto do grupo WhatsApp com link wag', any('RELÂMPAGO' in c['payload'].get('text', '') and '-wag-' in c['payload']['text'] for c in cs))

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
checar('setWebhook com a URL do túnel', len(sw) >= 1 and all(c['payload'].get('url') == 'https://exemplo-novo.trycloudflare.com/webhook/telegram-ofertas' for c in sw))
checar('n8n_webhook_url gravada', any(r['valor'] == 'https://exemplo-novo.trycloudflare.com/webhook/telegram-ofertas' for r in linhas('bfx_config', "where chave = 'n8n_webhook_url'")))
checar('segredo do webhook mantido', all(c['payload'].get('secret_token') == SEGREDO for c in sw))
checar('arrumação do grupo não repetida', not any(c['metodo'] == 'setChatDescription' for c in cs))

print('8) Avisos automáticos do grupo são apagados')
limpar_log()
update({'update_id': 9, 'message': {'message_id': 901, 'chat': {'id': -1001234567890, 'type': 'supergroup'}, 'from': {'id': 555}, 'new_chat_members': [{'id': 555}]}})
update({'update_id': 10, 'message': {'message_id': 902, 'chat': {'id': -1001234567890, 'type': 'supergroup'}, 'from': {'id': 555}, 'message_thread_id': 5, 'forum_topic_created': {'name': 'x'}}})
dl = [c for c in chamadas() if c['metodo'] == 'deleteMessage']
checar('apaga "entrou" com o bot publicador', len(dl) == 1 and dl[0]['payload']['message_id'] == 901 and dl[0]['token'] == 'TOKGRUPO')

c = sqlite3.connect(DB)
erros = c.execute("select count(*) from execution_entity where status != 'success'").fetchone()[0]
checar('nenhuma execução com erro no n8n', erros == 0)

print(f'\n{len(falhas)} falha(s)' if falhas else '\nTudo certo.')
sys.exit(1 if falhas else 0)
