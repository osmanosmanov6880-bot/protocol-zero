"""Optional browser QA in restricted environments (uses generated self-contained preview).
For actual HTTP navigation test serve the project normally, then open http://localhost:8080.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent

def check_mode(browser,mode='full',mobile=False):
    w,h=(390,844) if mobile else (1440,900)
    context=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1,accept_downloads=True)
    page=context.new_page();page.set_default_timeout(3000)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content((ROOT/f'previews/bridge-test-{mode}.html').read_text(),wait_until='domcontentloaded',timeout=25000)
    page.wait_for_function('!!window.PROTOCOL_ZERO_DEBUG',timeout=10000)
    assert page.locator('#art').is_visible()
    print('START',mode,mobile,flush=True)
    assert page.locator('#scene-title').inner_text().strip()
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
    if mode=='prototype':
        page.locator('.choice').first.evaluate("e => e.click()")
        assert page.locator('#scene-title').inner_text()=='КЕМ ВЫ СТАНЕТЕ?'
        page.locator('.choice').last.evaluate("e => e.click()")
        assert page.evaluate('window.PROTOCOL_ZERO_DEBUG.getState().route')=='observer'
        assert page.locator('#scene-title').inner_text()=='ВАШ ВЫБОР ЗАПИСАН'
        assert page.locator('#story-effect').is_visible()
        page.locator('#backBtn').evaluate("e => e.click()")
        page.locator('.choice').first.evaluate("e => e.click()")
        assert page.evaluate('window.PROTOCOL_ZERO_DEBUG.getState().route')=='creator'
    else:
        for option in ['enter','go','worlds']:
            page.locator('.choice').first.evaluate("e => e.click()")
        print('WORLD',flush=True)
        page.locator('.hotspot').first.evaluate("e => e.click()")
        print('FRAGMENT',flush=True)
        assert page.locator('#noteDialog').is_visible()
        page.locator('#confirmNote').evaluate("e => e.click()")
        assert len(page.evaluate('window.PROTOCOL_ZERO_DEBUG.getState().found'))==1
        page.locator('.choice').last.evaluate("e => e.click()") # direct to edda
        for _ in range(2):page.locator('.choice').first.evaluate("e => e.click()") # edda->genome->mutation
        assert page.locator('#scene-title').inner_text()=='ОДИН РАЗРЕЗ'
        print('MUTATION',flush=True)
        page.locator('.choice').first.evaluate("e => e.click()") # mutation dialog
        assert page.locator('#mutationDialog').is_visible()
        page.locator('#mutationInput').fill('Рекламные идеи растут благодаря людям')
        page.locator('#mutationSubmit').evaluate("e => e.click()")
        assert page.locator('#scene-title').inner_text()=='ПОТОМОК СОЗДАН'
        assert 'Рекламные идеи растут' in page.locator('#story-effect').inner_text()
        page.locator('.choice').first.evaluate("e => e.click()") # conflict
        page.locator('.choice').first.evaluate("e => e.click()") # verdict
        page.locator('.choice').first.evaluate("e => e.click()") # open
        assert page.locator('#scene-title').inner_text()=='ЭТО ТОЛЬКО НАЧАЛО'
        print('ENDING',flush=True)
        with page.expect_download(timeout=10000) as info:
            page.locator('.ending-actions button').nth(1).evaluate("e => e.click()")
        download=info.value
        assert download.suggested_filename.endswith('.json')
        page.locator('#archiveBtn').evaluate("e => e.click()")
        assert page.locator('.archive-entry:not([disabled])').count()>=9
        page.locator('#closeArchive').evaluate("e => e.click()")
        page.locator('#backBtn').evaluate("e => e.click()")
        page.locator('.choice').last.evaluate("e => e.click()")
        assert page.locator('#scene-title').inner_text()=='ПАУЗА — ТОЖЕ РЕШЕНИЕ'
        page.locator('#settingsBtn').evaluate("e => e.click()")
        page.select_option('#langSelect','en')
        page.select_option('#qualitySelect','lite')
        page.locator('#saveSettingsBtn').evaluate("e => e.click()")
        assert page.locator('#scene-title').inner_text()=='A PAUSE IS ALSO A CHOICE'
        assert 'quality-lite' in page.locator('#app').get_attribute('class')
        assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
    assert errors==[],errors
    context.close()
    return {'mode':mode,'mobile':mobile,'errors':len(errors)}

if __name__=='__main__':
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    for mode,mobile in [('prototype',False),('full',False),('full',True)]:
        print(check_mode(b,mode,mobile),flush=True)
    b.close()
