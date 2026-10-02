"""Prova automatica del Bicchierino (richiede Playwright). Uso: python3 tests/test_seduta.py"""
from playwright.sync_api import sync_playwright
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri() + "?debug"
SH = str(ROOT / "screenshot") + "/"
Path(SH).mkdir(exist_ok=True)
errors = []

def wait_active(page, name, timeout=9000):
    page.wait_for_function(f"document.getElementById('s-{name}').classList.contains('active')", timeout=timeout)

def g(page, expr): return page.evaluate("(() => { const G = window.__bi.G; return " + expr + "; })()")

def deal_roles(page, shots=False):
    n = g(page, "G.players.length")
    for i in range(n):
        wait_active(page, 'pass')
        page.wait_for_function("!document.getElementById('pass-show').disabled")
        if shots and i == 0: page.screenshot(path=SH + 'b03_pass.png')
        page.click('#pass-show'); wait_active(page, 'role')
        if shots and i == g(page, "G.spirit"): page.screenshot(path=SH + 'b04_role_spirit.png')
        if shots and i != g(page, "G.spirit") and i < 2: page.screenshot(path=SH + 'b04_role_vivo.png')
        page.click('#role-hide')
    wait_active(page, 'prep')

def answer(page, tokens, shot=None):
    wait_active(page, 'ask')
    page.click('#ask-go'); wait_active(page, 'answer')
    for t in tokens:
        page.click(f'.key[data-k="{t}"]')
    if shot: page.screenshot(path=SH + shot)
    page.click('#ans-done'); wait_active(page, 'omen')
    page.wait_for_selector('#omen-actions:not([hidden]), #s-end.active', timeout=6000)

with sync_playwright() as p:
    b = p.chromium.launch()
    for scheme in ['light', 'dark']:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme=scheme)
        page = ctx.new_page()
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(URL); page.wait_for_timeout(1500)
        page.screenshot(path=SH + f'b01_home_{scheme}.png')
        if scheme == 'dark':
            page.click('text=Le lettere'); wait_active(page, 'board'); page.wait_for_timeout(300)
            page.screenshot(path=SH + 'b02_board_dark.png', full_page=True)
            ctx.close(); continue
        page.click('text=Nuova seduta'); wait_active(page, 'setup')
        for n in ['Olivia', 'Luca', 'Giò', 'Marta', 'Sara']:
            page.fill('#name-in', n); page.press('#name-in', 'Enter')
        page.click('#length [data-val="8"]')
        page.screenshot(path=SH + 'b02_setup.png')
        page.click('#start-btn')
        deal_roles(page, shots=True)
        page.screenshot(path=SH + 'b05_prep.png')
        page.click('#prep-go'); wait_active(page, 'ask'); page.wait_for_timeout(400)
        page.screenshot(path=SH + 'b06_ask.png')
        word = g(page, "G.word"); spirit = g(page, "G.spirit")
        print('parola:', word, '| spirito:', g(page, "G.players[G.spirit].name"))
        # 1) risposta innocua, poi esorcismo sbagliato
        safe = [c for c in 'MNOT' if c not in word][:3] or ['SÌ']
        answer(page, safe, shot='b07_answer.png')
        page.screenshot(path=SH + 'b08_omen.png')
        page.click('#omen-exo'); wait_active(page, 'exo')
        page.wait_for_selector('#exo-pick:not([hidden])', timeout=6000)
        page.screenshot(path=SH + 'b09_exo.png')
        wrong = [i for i in range(5) if i != spirit][0]
        page.locator('#exo-pick button').nth(wrong if wrong < spirit else wrong).click() if False else page.click(f"#exo-pick button:has-text('{g(page, 'G.players[%d].name' % wrong)}')")
        wait_active(page, 'reveal'); page.wait_for_selector('#rev-next:not([hidden]), #s-end.active', timeout=7000)
        print('dopo esorcismo sbagliato:', page.inner_text('#rev-head'), '| regalate:', g(page, "Array.from(G.lit)"), '| dita:', g(page, "G.players.filter(p=>!p.out).length"))
        page.screenshot(path=SH + 'b10_reveal_wrong.png')
        page.click('#rev-next'); wait_active(page, 'ask')
        # 2) risposta che completa la parola: vince lo Spirito
        rest = [c for c in dict.fromkeys(word) if c not in g(page, "Array.from(G.lit)")]
        answer(page, rest)
        wait_active(page, 'end', 6000); page.wait_for_timeout(500)
        print('fine 1:', page.inner_text('#end-title'), '|', page.inner_text('#end-sub'))
        page.screenshot(path=SH + 'b11_end_spirit.png', full_page=True)
        # 3) nuova seduta: esorcismo giusto
        page.click('#again-btn'); deal_roles(page)
        page.click('#prep-go'); wait_active(page, 'ask')
        page.click('#ask-change'); print('cambia domanda disattivato:', page.is_disabled('#ask-change'))
        answer(page, ['SÌ'])
        page.click('#omen-exo'); page.wait_for_selector('#exo-pick:not([hidden])', timeout=6000)
        page.click(f"#exo-pick button:has-text('{g(page, 'G.players[G.spirit].name')}')")
        wait_active(page, 'end', 7000); page.wait_for_timeout(500)
        print('fine 2:', page.inner_text('#end-title'), '|', page.inner_text('#end-sub'))
        page.screenshot(path=SH + 'b12_end_vivi.png')
        # 4) seduta fino all'alba, ultimo esorcismo sbagliato
        page.click('#again-btn'); deal_roles(page)
        page.click('#prep-go')
        for k in range(8):
            answer(page, ['NO'])
            if k < 7: page.click('#omen-next')
        print('alba:', page.inner_text('#omen-text')[:60], '| pulsante prossima nascosto:', page.is_hidden('#omen-next'))
        page.click('#omen-exo'); page.wait_for_selector('#exo-pick:not([hidden])', timeout=6000)
        sp = g(page, "G.spirit"); wrong = g(page, "G.players.findIndex((p,i)=>i!==G.spirit && !p.out)")
        page.click(f"#exo-pick button:has-text('{g(page, 'G.players[%d].name' % wrong)}')")
        wait_active(page, 'end', 7000)
        print('fine 3:', page.inner_text('#end-title'), '|', page.inner_text('#end-sub'))
        ctx.close()
    # schermate di gioco in tema scuro
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='dark')
    page = ctx.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(800)
    page.click('text=Nuova seduta')
    for n in ['Olivia', 'Luca', 'Giò', 'Marta']:
        page.fill('#name-in', n); page.press('#name-in', 'Enter')
    page.click('#start-btn'); deal_roles(page)
    page.click('#prep-go'); wait_active(page, 'ask'); page.wait_for_timeout(500)
    page.screenshot(path=SH + 'b13_ask_dark.png')
    word = g(page, "G.word")
    miss = list(dict.fromkeys(word))
    answer(page, miss[:-1], shot='b14_answer_dark.png')
    page.wait_for_timeout(1500)
    page.screenshot(path=SH + 'b15_omen_blue_dark.png')
    print('presenza quasi completa:', page.inner_text('#omen-head'))
    b.close()
print('ERRORS:', errors or 'none')
