#!/usr/bin/env python3
"""Run five browser-controlled games; this is not a human playtest.

Requires Python Playwright and a running Vite server. The agent sends normal
key events but reads the exposed debug state for navigation; it never changes
HP or skips rooms. Durations are wall-clock seconds and a cutoff is not a win.
"""
import asyncio, json, math, time, os
from playwright.async_api import async_playwright

URL = os.environ.get('CFCQ_URL','http://127.0.0.1:5173/').rstrip('/')
SEEDS = [101, 202, 303, 404, 505]
MAX_SECONDS = float(os.environ.get('CFCQ_MAX_SECONDS','150'))
RESULTS = os.environ.get('CFCQ_PLAYTEST_OUTPUT', 'cfcq-playtest-results.json')
STATE = '''() => {
 const g=window.__cfcq,b=g.battle,p=b.player;
 const foes=b.enemies.filter(e=>e.alive).map(e=>({x:e.pos.x,y:e.pos.y,hp:e.hp,id:e.spec.id}));
 if(b.boss && b.boss.alive) foes.push({x:b.boss.pos.x,y:b.boss.pos.y,hp:b.boss.hp,id:'boss'});
 return {pos:{x:p.pos.x,y:p.pos.y},hp:p.hp,alive:p.alive,techLv:p.techLv,bladeLv:p.bladeLv,
  level:b.progress.level,room:b.progress.roomIndex,roomKind:b.plan.rooms[b.progress.roomIndex]?.kind,
  rooms:b.plan.rooms.map(r=>r.kind),doorOpen:b.doorOpen,foes,kills:b.hud.kills,
  dialog:b.pausedForDialog,upgrade:b.pausedForUpgrade,inventory:b.pausedForInventory,
  paused:b.pausedForPauseMenu,death:b.hud.showDeathOverlay,victory:b.hud.victory,fps:g.loop.fps};
}'''

async def one(browser, seed, ix):
    ctx=await browser.new_context(viewport={'width':960,'height':540})
    page=await ctx.new_page()
    errors=[]; responses=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('response',lambda r: responses.append({'status':r.status,'url':r.url}) if r.status>=400 else None)
    await page.goto(f'{URL}/?seed={seed}',wait_until='networkidle')
    await page.locator('.menu-start').click()
    await page.wait_for_function('window.__cfcq.sm.currentName === "battle"')
    start=time.monotonic(); seen=[]; picks=[]; stress=[]; held=set(); snapshots=[]
    lastroom=None; last_report=0; didpause=False; didbag=False; didextra=False; why='cutoff'
    async def setkeys(keys):
        nonlocal held
        for k in held-keys: await page.keyboard.up(k)
        for k in keys-held: await page.keyboard.down(k)
        held=keys
    try:
      while time.monotonic()-start < MAX_SECONDS:
        elapsed=time.monotonic()-start
        s=await page.evaluate(STATE)
        room=(s['level'],s['room'],s['roomKind'])
        if room!=lastroom:
          seen.append({'time_s':round(elapsed,1),'level':s['level'],'room':s['room']+1,'kind':s['roomKind'],'hp':s['hp'],'kills':s['kills']})
          lastroom=room
        if elapsed-last_report>=20:
          snapshots.append({'time_s':round(elapsed,1),'room':s['room']+1,'hp':s['hp'],'kills':s['kills'],'fps':round(s['fps'],1)})
          print(f'run {ix+1} seed={seed}: {elapsed:.0f}s level={s["level"]} room={s["room"]+1} {s["roomKind"]} hp={s["hp"]} kills={s["kills"]}',flush=True)
          last_report=elapsed
        if s['death'] or not s['alive']:
          why='death'; break
        if s['victory']:
          why='victory'; break
        if s['dialog']:
          await setkeys(set()); await page.keyboard.press('e'); await asyncio.sleep(.15); continue
        if s['upgrade'] or await page.locator('.upgrade-panel').count():
          await setkeys(set())
          cards=await page.locator('.uc-name').all_inner_texts()
          if cards:
            choice=ix%len(cards)
            await page.keyboard.press(str(choice+1))
            picks.append({'time_s':round(elapsed,1),'options':cards,'selected':cards[choice]})
            await asyncio.sleep(.15)
          else: await asyncio.sleep(.2)
          continue
        if not didpause and elapsed>6:
          didpause=True; await setkeys(set()); before=await page.evaluate(STATE)
          await page.keyboard.press('Escape'); await asyncio.sleep(.18)
          panel=await page.locator('.pause-panel').is_visible()
          await page.keyboard.down('d'); await asyncio.sleep(.45); await page.keyboard.up('d')
          during=await page.evaluate(STATE)
          await page.keyboard.press('Escape'); await asyncio.sleep(.15)
          after=await page.locator('.pause-panel').is_visible()
          stress.append({'action':'ESC 暂停后按住 D，再 ESC 恢复','panel':bool(panel),'position_unchanged':math.dist([before['pos']['x'],before['pos']['y']],[during['pos']['x'],during['pos']['y']])<0.01,'closed':not bool(after)})
          continue
        if not didbag and elapsed>9:
          didbag=True; await setkeys(set()); await page.keyboard.press('b'); await asyncio.sleep(.12)
          opened=await page.locator('.inv-panel').count(); await page.keyboard.press('b'); await asyncio.sleep(.12)
          stress.append({'action':'B 打开并关闭背包','opened':bool(opened),'closed':not bool(await page.locator('.inv-panel').count())})
          continue
        if not didextra and elapsed>11:
          didextra=True; await page.keyboard.press('1'); await page.keyboard.press('e'); await page.keyboard.press('Space')
          stress.append({'action':'非升级/非交互点连续按 1、E、空格','result':'按键已发送，观察后续状态与异常'})
        p=s['pos']; target=None
        if s['doorOpen']:
          target={'x':2345,'y':675}
        elif s['foes']:
          foe=min(s['foes'],key=lambda e:math.hypot(e['x']-p['x'],e['y']-p['y']))
          target=foe
        if target:
          dx=target['x']-p['x']; dy=target['y']-p['y']; dist=math.hypot(dx,dy)
          keys=set()
          if s['doorOpen'] or dist>55+(ix%3)*10:
            if abs(dx)>22: keys.add('d' if dx>0 else 'a')
            if abs(dy)>22: keys.add('s' if dy>0 else 'w')
          await setkeys(keys)
        else: await setkeys(set())
        await asyncio.sleep(.35)
      final=await page.evaluate(STATE)
      return {'seed':seed,'duration_wall_s':round(time.monotonic()-start,1),'end_reason':why,'final':final,'rooms_visited':seen,'upgrade_choices':picks,'unusual_inputs':stress,'snapshots':snapshots,'page_errors':errors,'http_errors':responses}
    finally:
      await setkeys(set()); await ctx.close()

async def main():
  async with async_playwright() as p:
    launch={'headless':True, 'args':['--no-sandbox','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-dev-shm-usage']}
    if os.environ.get('CFCQ_CHROMIUM'):
      launch['executable_path']=os.environ['CFCQ_CHROMIUM']
    browser=await p.chromium.launch(**launch)
    results=await asyncio.gather(*(one(browser,seed,i) for i,seed in enumerate(SEEDS)),return_exceptions=True)
    clean=[]
    for seed,r in zip(SEEDS,results):
      clean.append({'seed':seed,'error':repr(r)} if isinstance(r,BaseException) else r)
    with open(RESULTS,'w',encoding='utf-8') as f: json.dump(clean,f,ensure_ascii=False,indent=2)
    for r in clean: print('RESULT',json.dumps({k:r.get(k) for k in ['seed','duration_wall_s','end_reason','error']},ensure_ascii=False),flush=True)
    await browser.close()
    if any('error' in r for r in clean):
      raise SystemExit(1)

if __name__=='__main__': asyncio.run(main())
