#!/usr/bin/env python3
"""CFCQ P1 browser smoke. Requires `pip install playwright` and Chromium.

Start `npm run dev` first. Override CFCQ_URL / CFCQ_CHROMIUM if needed.
Endgame cases use the exposed development object to inject state; they are not
full natural playthroughs. The script only operates on the local test context.
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('CFCQ_URL', 'http://127.0.0.1:5173/').rstrip('/')
SHOT_DIR = os.environ.get('CFCQ_SCREENSHOT_DIR')


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    print('PASS:', message, flush=True)


def make_page(browser, seed=424242):
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.goto(f'{BASE}/?seed={seed}', wait_until='networkidle')
    page.wait_for_selector('.menu-start')
    return context, page, errors


def dismiss_dialog(page):
    for _ in range(100):
        if page.locator('.dialog-box').count() == 0:
            page.wait_for_timeout(100)
            return
        page.keyboard.press('e')
        page.wait_for_timeout(40)
    raise AssertionError('对话在 100 次 E 后仍未结束')


def start(page):
    check(page.locator('.menu-title').inner_text() == '藏锋出鞘', '菜单标题')
    page.locator('.menu-start').click()
    page.wait_for_function('window.__cfcq.sm.currentName === "battle"')
    dismiss_dialog(page)


def position(page):
    return page.evaluate('''() => ({...window.__cfcq.battle.player.pos})''')


def screenshot(page, name):
    if SHOT_DIR:
        os.makedirs(SHOT_DIR, exist_ok=True)
        page.screenshot(path=os.path.join(SHOT_DIR, name))


def move_right(page, ms=500):
    page.keyboard.down('d')
    page.wait_for_timeout(ms)
    page.keyboard.up('d')


with sync_playwright() as playwright:
    launch_args = {'headless': True}
    if os.environ.get('CFCQ_CHROMIUM'):
        launch_args['executable_path'] = os.environ['CFCQ_CHROMIUM']
    browser = playwright.chromium.launch(**launch_args)
    contexts = []
    try:
        context, page, errors = make_page(browser)
        contexts.append(context)
        start(page)
        before = position(page)
        move_right(page)
        check(position(page)['x'] > before['x'] + 20, '开局后 WASD 移动')

        page.keyboard.press('Escape')
        page.wait_for_timeout(120)
        check(page.locator('.pause-panel').is_visible(), 'ESC 打开暂停面板')
        before = position(page)
        move_right(page)
        check(position(page) == before, '暂停时角色不移动')
        page.keyboard.press('b')
        page.wait_for_timeout(100)
        check(page.locator('.inv-panel').count() == 0, '暂停时背包不会打开')
        page.locator('.pause-panel button').click()
        check(not page.locator('.pause-panel').is_visible(), '继续按钮关闭暂停')
        before = position(page)
        move_right(page, 350)
        check(position(page)['x'] > before['x'] + 20, '恢复后可继续移动')

        page.keyboard.press('b')
        page.wait_for_selector('.inv-panel')
        before = position(page)
        move_right(page, 300)
        check(position(page) == before, '背包打开期间战斗冻结')
        page.keyboard.press('Escape')
        page.wait_for_timeout(120)
        check(page.locator('.inv-panel').count() == 0 and not page.locator('.pause-panel').is_visible(), '背包内 ESC 返回而非叠加暂停')
        page.locator('.inv-toggle-btn').click()
        check(page.locator('.inv-panel').count() == 1, '行囊按钮打开背包')
        page.locator('.inv-toggle-btn').click()
        check(page.locator('.inv-panel').count() == 0, '行囊按钮关闭背包')

        # Force experience only for this isolated upgrade-panel smoke test.
        page.evaluate('''() => {const p=window.__cfcq.battle.player; p.addTechExp(p.techExpNeed)}''')
        page.wait_for_selector('.upgrade-panel')
        choices = page.locator('.uc-name').all_inner_texts()
        check(len(choices) == 3, '注入经验后出现三选一升级')
        page.keyboard.press('Escape')
        page.keyboard.press('b')
        page.wait_for_timeout(100)
        check(page.locator('.upgrade-panel').count() == 1 and page.locator('.inv-panel').count() == 0 and not page.locator('.pause-panel').is_visible(), '升级期间不叠加背包或暂停')
        page.keyboard.press('1')
        page.wait_for_timeout(120)
        check(page.locator('.upgrade-panel').count() == 0 and page.evaluate('window.__cfcq.battle.takenOptions.size') == 1, '数字键选择升级并恢复')

        # Force damage to validate the death path without claiming a full run.
        page.evaluate('''() => {const p=window.__cfcq.battle.player; p.iframes=0; p.takeDamage(100000,'smoke')}''')
        page.wait_for_function('window.__cfcq.battle.deathSaved')
        death = page.evaluate('''() => ({shown:window.__cfcq.battle.hud.showDeathOverlay,save:JSON.parse(localStorage.getItem('cfcq.save.v1'))})''')
        check(death['shown'] and death['save']['run'] is None, '注入致命伤后死亡结算和存档')
        page.wait_for_timeout(120)
        screenshot(page, 'death.png')
        page.keyboard.press('Escape')
        page.wait_for_timeout(100)
        check(not page.locator('.pause-panel').is_visible(), '死亡后不弹暂停')
        page.keyboard.press('b')
        page.evaluate("document.querySelector('.inv-toggle-btn').click()")
        page.wait_for_timeout(100)
        check(not page.locator('.inv-toggle-btn').is_visible() and page.locator('.inv-panel').count() == 0, '死亡后隐藏行囊并禁止打开背包')
        check(not errors, f'浏览器无未捕获异常: {errors}')
        context.close()

        # Compare the app's complete generated LevelPlan, not just room types.
        plans = []
        for seed in (424242, 424242, 424243):
            context, page, errors = make_page(browser, seed)
            contexts.append(context)
            page.locator('.menu-start').click()
            page.wait_for_function('window.__cfcq.sm.currentName === "battle"')
            plans.append(page.evaluate('window.__cfcq.battle.plan'))
            check(not errors, f'种子 {seed} 无未捕获异常')
            context.close()
        check(plans[0] == plans[1], '相同 URL 种子生成完整相同关卡布局')
        check(plans[0] != plans[2], '不同 URL 种子生成不同关卡布局')

        # Jump to a first-level Boss room; this tests the gate, not a real clear.
        context, page, errors = make_page(browser, 42)
        contexts.append(context)
        start(page)
        page.evaluate('''() => {const b=window.__cfcq.battle;b.storyFlags.preBossPlayed=true;b.progress.roomIndex=b.plan.rooms.length-1;b.enterRoom(b.progress.roomIndex)}''')
        page.wait_for_timeout(2600)
        state = page.evaluate('''() => {const b=window.__cfcq.battle;return {bossAlive:b.boss?.alive,doorOpen:b.doorOpen,enemies:b.enemies.filter(e=>e.alive).length}}''')
        check(state['bossAlive'] and not state['doorOpen'], 'Boss 存活时门保持关闭（注入房间）')
        check(state['enemies'] == 0, 'Boss 房不凭空推进普通战斗波次（注入房间）')
        page.evaluate('window.__cfcq.battle.boss.hp = 0')
        page.wait_for_function('window.__cfcq.battle.boss === null')
        dismiss_dialog(page)
        check(page.evaluate('window.__cfcq.battle.doorOpen'), 'Boss 被击败且战后对话结束后门开启（注入伤害）')
        check(not errors, f'Boss 路径无未捕获异常: {errors}')
        context.close()

        # Trigger the actual level-clear method with a low HP setup.
        context, page, errors = make_page(browser, 42)
        contexts.append(context)
        start(page)
        page.evaluate('''() => {const b=window.__cfcq.battle;b.player.hp=25;b.onLevelClearM8()}''')
        dismiss_dialog(page)
        stats = page.evaluate('''() => {const b=window.__cfcq.battle;return {level:b.progress.level,hp:b.player.hp,max:b.player.hpMax}}''')
        check(stats['level'] == 2 and stats['hp'] == stats['max'], '过关进入下一关时回满血（注入过关）')
        check(not errors, f'关卡切换无未捕获异常: {errors}')
        context.close()

        # Trigger final clear directly; verify ending dialog, save, and freeze.
        context, page, errors = make_page(browser, 42)
        contexts.append(context)
        start(page)
        page.evaluate('''() => {const b=window.__cfcq.battle;b.progress.level=6;b.onLevelClearM8()}''')
        check(page.locator('.dialog-box').count() == 1, '终关结算触发结局对话（注入过关）')
        dismiss_dialog(page)
        state = page.evaluate('''() => {const b=window.__cfcq.battle;return {victory:b.hud.victory,save:JSON.parse(localStorage.getItem('cfcq.save.v1'))}}''')
        check(state['victory'] and state['save']['codex']['bestLevel'] == 6, '胜利结算与图鉴存档（注入过关）')
        screenshot(page, 'victory.png')
        before = position(page)
        move_right(page)
        check(position(page) == before, '胜利后战斗冻结（注入过关）')
        page.keyboard.press('Escape')
        page.wait_for_timeout(120)
        check(not page.locator('.pause-panel').is_visible(), '胜利后不弹暂停')
        page.keyboard.press('b')
        page.evaluate("document.querySelector('.inv-toggle-btn').click()")
        page.wait_for_timeout(100)
        check(not page.locator('.inv-toggle-btn').is_visible() and page.locator('.inv-panel').count() == 0, '胜利后隐藏行囊并禁止打开背包')
        check(not errors, f'胜利路径无未捕获异常: {errors}')
        context.close()
        print('\n浏览器冒烟全部通过；Boss、死亡和胜利场景包含显式状态注入。', flush=True)
    finally:
        browser.close()
