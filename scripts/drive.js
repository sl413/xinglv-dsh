/* eslint-disable */
// 星履 · 验收驱动脚本
// 由预览服务在 ?drive=<scenario> 时注入。它只做两件事：
//   1. 像真实用户那样操作界面（点击、输入、拖动）
//   2. 把「发生了什么」写进屏幕左上角的一条诊断带，供截图人工核对
// 应用本体不包含也不依赖这个文件。

;(function () {
  var scenario = window.__XL_DRIVE__ || 'noop'
  var banner = document.createElement('div')
  var narrow = window.innerWidth < 760
  var noBanner = /[?&]nb=1/.test(window.location.search)
  banner.style.cssText =
    'position:fixed;' +
    (narrow ? 'left:6px;bottom:6px;' : 'left:50%;top:6px;transform:translateX(-50%);') +
    'z-index:99999;font:11px/1.45 ui-monospace,Consolas,monospace;' +
    'color:#bfe9d6;background:rgba(2,6,12,.78);padding:5px 10px;border:1px solid rgba(120,220,180,.35);border-radius:6px;' +
    'max-width:min(92vw,880px);white-space:pre-wrap;pointer-events:none'
  banner.textContent = 'drive=' + scenario
  function mountBanner() {
    if (noBanner) return
    if (document.body) document.body.appendChild(banner)
    else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(banner) })
  }
  mountBanner()

  var lines = ['drive=' + scenario]
  function log(m) {
    lines.push(m)
    if (!noBanner) banner.textContent = lines.join('\n')
    try {
      console.log('[drive]', m)
    } catch (e) {}
  }

  function wait(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms)
    })
  }

  function q(sel) {
    return document.querySelector(sel)
  }

  async function waitFor(sel, timeout) {
    var t0 = Date.now()
    while (Date.now() - t0 < (timeout || 8000)) {
      var el = q(sel)
      if (el) return el
      await wait(60)
    }
    return null
  }

  function clickByText(text) {
    var btns = Array.prototype.slice.call(document.querySelectorAll('button'))
    for (var i = 0; i < btns.length; i++) {
      if ((btns[i].textContent || '').indexOf(text) >= 0) {
        btns[i].click()
        return true
      }
    }
    return false
  }

  function setValue(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function pev(el, type, x, y, extra) {
    var init = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
    }
    if (extra) for (var k in extra) init[k] = extra[k]
    el.dispatchEvent(new PointerEvent(type, init))
  }

  async function tapCanvas(x, y) {
    var c = q('canvas')
    if (!c) return
    pev(c, 'pointerdown', x, y)
    await wait(28)
    pev(c, 'pointerup', x, y)
  }

  function qaState() {
    var qa = window.__XINGLV_QA__
    return qa ? qa.state() : null
  }

  /**
   * 放行被挂起的页面加载，无头 Chrome 会立刻截图。
   * 这样「截哪一帧」完全由脚本决定，而不是靠猜一个毫秒数。
   */
  async function releaseHold(delay) {
    await wait(delay || 0)
    try {
      var r = await fetch('/__release')
      log('hold released: ' + (await r.text()))
    } catch (e) {
      log('release failed: ' + e)
    }
  }

  /** 等镜头真正停稳：点一颗正在滑动的星是打不中的，这不是应用的错 */
  async function waitForCameraSettle(timeout) {
    var t0 = Date.now()
    var last = null
    var stable = 0
    while (Date.now() - t0 < (timeout || 12000)) {
      var st = qaState()
      var p = st && st.probe
      if (p) {
        var key = p.camera.join(',') + '|' + p.radius + '|' + p.directorPhase
        if (key === last) {
          stable++
          if (stable >= 4) {
            log('camera settled (' + p.directorPhase + ') after ' + ((Date.now() - t0) / 1000).toFixed(1) + 's')
            return true
          }
        } else {
          stable = 0
          last = key
        }
      }
      await wait(90)
    }
    log('camera did not settle')
    return false
  }

  async function waitForPhase(name, timeout) {
    var t0 = Date.now()
    while (Date.now() - t0 < (timeout || 12000)) {
      var st = qaState()
      if (st && st.probe && st.probe.directorPhase === name) return true
      await wait(120)
    }
    return false
  }

  async function huntStar(maxRing) {
    // 优先用 QA 探针拿到星的屏幕坐标，再派发真实指针事件 —— 走的还是用户路径
    var qa = window.__XINGLV_QA__
    if (qa && qa.starScreenXY) {
      var list = qa.starScreenXY()
      log('qa visible stars=' + list.length)
      var w = window.innerWidth
      var h = window.innerHeight
      var cx = w / 2
      var cy = h / 2
      var best = null
      for (var i = 0; i < list.length; i++) {
        var s = list[i]
        if (s.x > w - 230) continue
        if (s.y > h - 140 || s.y < 70) continue
        if (s.x < 24) continue
        var score = Math.hypot(s.x - cx, s.y - cy) - s.radius * 4
        if (!best || score < best.score) {
          best = s
          best.score = score
        }
      }
      if (best) {
        var probe = qa.pickAt(best.x, best.y)
        log('target "' + best.title + '" r=' + Math.round(best.radius) + 'px pick=' + (probe ? Math.round(probe.score * 100) + '%' : 'miss'))
        var before = qa.state()
        var c = q('canvas')
        // 必须在同一个任务里连发 down/up：无头软件渲染一帧要一秒以上，
        // 中间只要让出事件循环，合成事件的时间戳就会差出一千多毫秒，被当成拖动。
        pev(c, 'pointerdown', best.x, best.y)
        pev(c, 'pointerup', best.x, best.y)
        await wait(220)
        var after = qa.state()
        log('lastPointer=' + JSON.stringify(after.probe ? after.probe.lastPointer : null))
        log('reading after up=' + JSON.stringify(after.reading) + ' before=' + JSON.stringify(before.reading))
        if (q('.reading')) {
          log('opened ' + (q('.constellation-list') ? 'constellation' : 'star') + ': ' + (q('.reading-title') ? q('.reading-title').textContent : ''))
          return q('.constellation-list') ? 'constellation' : 'star'
        }
        log('pointer path failed; state before=' + JSON.stringify(before).slice(0, 160))
        // 兜底（并如实标注：说明指针路径有问题）
        qa.focus(best.id)
        await wait(180)
        if (q('.reading')) {
          log('FALLBACK qa.focus() worked (pointer path is broken)')
          return 'star'
        }
        log('qa.focus() also failed')
      }
    }
    // 退路：盲点网格
    var c = q('canvas')
    if (!c) return 'no canvas'
    var r = c.getBoundingClientRect()
    var ccx = r.left + r.width / 2
    var ccy = r.top + r.height / 2
    var stepX = 30
    var stepY = 26
    for (var ring = 0; ring <= (maxRing || 9); ring++) {
      for (var iy = -ring; iy <= ring; iy++) {
        for (var ix = -ring; ix <= ring; ix++) {
          if (Math.max(Math.abs(ix), Math.abs(iy)) !== ring) continue
          var x = ccx + ix * stepX
          var y = ccy + iy * stepY
          if (x < r.left + 3 || x > r.right - 3 || y < r.top + 3 || y > r.bottom - 3) continue
          await tapCanvas(x, y)
          await wait(40)
          if (q('.reading')) {
            var kind = q('.constellation-list') ? 'constellation' : 'star'
            log('grid hit ' + kind + ' ring=' + ring)
            return kind
          }
        }
      }
    }
    log('no star found')
    return 'none'
  }

  async function orbit(dx, dy) {
    var c = q('canvas')
    var r = c.getBoundingClientRect()
    var x = r.left + r.width * 0.5
    var y = r.top + r.height * 0.5
    pev(c, 'pointerdown', x, y)
    for (var i = 1; i <= 12; i++) {
      pev(c, 'pointermove', x + (dx * i) / 12, y + (dy * i) / 12)
      await wait(16)
    }
    pev(c, 'pointerup', x + dx, y + dy)
  }

  function wheel(dy) {
    var c = q('canvas')
    if (c) c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: dy }))
  }

  async function dragTrack(fraction) {
    var t = await waitFor('.track', 4000)
    if (!t) {
      log('no time track')
      return
    }
    var r = t.getBoundingClientRect()
    var y = r.top + r.height * (1 - fraction)
    pev(t, 'pointerdown', r.left + 1, r.top + 2)
    await wait(50)
    pev(t, 'pointermove', r.left + 1, y)
    await wait(50)
    pev(t, 'pointerup', r.left + 1, y)
    log('track -> ' + Math.round(fraction * 100) + '%')
  }

  async function loadSample() {
    var el = await waitFor('.entry', 6000)
    if (!el) {
      log('entry not shown')
      return false
    }
    var ok = clickByText('先看看一片示例星河')
    log('sample click=' + ok)
    await wait(3400)
    return ok
  }

  async function openComposerAndFill(title, reflection) {
    var btn = await waitFor('.light-btn', 6000)
    if (!btn) {
      log('no light button')
      return false
    }
    btn.click()
    await wait(500)
    var ta = q('.composer .text-area')
    if (!ta) {
      log('no composer')
      return false
    }
    setValue(ta, title)
    await wait(200)
    var areas = document.querySelectorAll('.composer .text-area')
    if (areas.length > 1 && reflection) setValue(areas[1], reflection)
    await wait(300)
    log('composer filled')
    return true
  }

  async function expandRefine() {
    if (clickByText('再完善一下')) {
      await wait(400)
      log('refine expanded')
    }
  }

  /** 生成一份「密集」验收档案：只用于看星河的规模，不是产品数据 */
  function makeDenseArchive(n) {
    var domains = ['academy', 'craft', 'career', 'relation', 'journey', 'passion', 'family', 'health', 'creation']
    var journeys = ['从零开始写代码', '从转行到靠它生活', '第一次一个人上路', '写字这件事', '把身体找回来']
    var now = Date.now()
    var ach = []
    for (var i = 0; i < n; i++) {
      var f = i / n
      var ts = now - (1 - f) * 12 * 365 * 86400000 - (i % 7) * 86400000
      var d = new Date(ts)
      var iso = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2)
      ach.push({
        id: 'qa_dense_' + i,
        title: '第 ' + (i + 1) + ' 件值得记住的事',
        happenedAt: iso,
        reflection: '',
        domain: domains[i % domains.length],
        importance: 1 + (i % 5),
        resonance: i % 6,
        journeyId: 'jr_qa_' + (i % journeys.length),
        createdAt: iso + 'T12:00:00.000Z',
        updatedAt: iso + 'T12:00:00.000Z',
      })
    }
    return JSON.stringify({
      app: 'xinglv',
      schemaVersion: 1,
      exportedAt: new Date(now).toISOString(),
      achievements: ach,
      journeys: journeys.map(function (name, k) {
        return { id: 'jr_qa_' + k, name: name, createdAt: new Date(now - 12 * 365 * 86400000).toISOString() }
      }),
      createdAt: new Date(now - 12 * 365 * 86400000).toISOString(),
    })
  }

  async function run() {
    var t0 = Date.now()
    var releaseDelay = 900

    // 草稿可靠性的两趟验证：写下内容 → 真的刷新页面 → 看它是否还在
    if (scenario === 'draft-persist') {
      var pass = null
      try {
        pass = sessionStorage.getItem('xl_pass')
      } catch (e) {}
      if (pass !== '2') {
        try {
          sessionStorage.setItem('xl_pass', '2')
        } catch (e) {}
        await wait(1400)
        var okp = await openComposerAndFill('刷新也不该丢的一句话', '这一句必须活过一次刷新。')
        log('pass1 composer filled=' + okp)
        await wait(1400)
        log('pass1 reloading now')
        location.reload()
        return
      }
      await wait(1800)
      if (!q('.composer')) {
        var lb = q('.light-btn')
        if (lb) lb.click()
        await wait(700)
      }
      var firstLine = q('.composer-first')
      var area = q('.composer .text-area')
      log('pass2 composerOpen=' + !!q('.composer'))
      log('pass2 title="' + (area ? area.value : 'none') + '"')
      log('pass2 notice="' + (firstLine ? firstLine.textContent.trim().slice(0, 30) : 'none') + '"')
      await releaseHold(700)
      return
    }

    if (scenario === 'noop' || scenario === 'settled') {
      log('idle; app should finish boot by itself')
      await releaseHold(releaseDelay)
      return
    }
    await wait(900)

    if (scenario === 'sample') {
      await loadSample()
      await waitForCameraSettle(16000)
      releaseDelay = 600
    } else if (scenario === 'orbit') {
      await loadSample()
      await waitForCameraSettle(16000)
      wheel(-260)
      await wait(600)
      await orbit(-300, -70)
      await wait(1800)
      log('orbited')
      releaseDelay = 500
    } else if (scenario === 'focus') {
      await loadSample()
      await waitForCameraSettle(16000)
      await huntStar(9)
      await waitForPhase('focused', 40000)
      log('flight settled, phase=' + (qaState() ? qaState().probe.directorPhase : '?'))
      releaseDelay = 900
    } else if (scenario === 'detail') {
      await loadSample()
      await waitForCameraSettle(16000)
      var kind = await huntStar(9)
      await waitForPhase('focused', 40000)
      if (kind === 'star' && clickByText('再靠近一点')) {
        log('zooming to core')
        await waitForPhase('focused', 40000)
        await wait(900)
      }
      releaseDelay = 900
    } else if (scenario === 'constellation') {
      await loadSample()
      await waitForCameraSettle(16000)
      var k = await huntStar(11)
      if (k === 'star') {
        await waitForPhase('focused', 40000)
        if (clickByText('返回')) {
          await waitForPhase('free', 40000)
          log('back to overview; hunting constellation')
          await huntStar(6)
          await waitForPhase('focused', 40000)
        }
      }
      releaseDelay = 900
    } else if (scenario === 'past') {
      await loadSample()
      await waitForCameraSettle(16000)
      await dragTrack(0.34)
      await wait(1600)
      releaseDelay = 600
    } else if (scenario === 'past-far') {
      await loadSample()
      await waitForCameraSettle(16000)
      await dragTrack(0.08)
      await wait(1600)
      releaseDelay = 600
    } else if (scenario === 'composer') {
      var ok = await openComposerAndFill('第一次把我的星星放在夜空里', '那天我意识到，如果没有人替我记住，这些路就等于没走过。')
      if (ok) await expandRefine()
      await wait(400)
      releaseDelay = 400
    } else if (scenario === 'ceremony') {
      var ok2 = await openComposerAndFill('第一次把我的星星放在夜空里', '那天我意识到，如果没有人替我记住，这些路就等于没走过。')
      if (ok2) {
        await wait(400)
        if (clickByText('点亮这颗星')) log('submitted')
        else log('submit button not found')
      }
      releaseDelay = 5200
    } else if (scenario === 'ceremony-mid') {
      var okm = await openComposerAndFill('第一次把我的星星放在夜空里', '那天我意识到，如果没有人替我记住，这些路就等于没走过。')
      if (okm) {
        await wait(400)
        if (clickByText('点亮这颗星')) log('submitted')
      }
      releaseDelay = 2600
    } else if (scenario === 'ceremony-flash') {
      var okf = await openComposerAndFill('第一次把我的星星放在夜空里', '那天我意识到，如果没有人替我记住，这些路就等于没走过。')
      if (okf) {
        await wait(400)
        if (clickByText('点亮这颗星')) log('submitted')
      }
      releaseDelay = 3800
    } else if (scenario === 'ceremony-late') {
      var ok3 = await openComposerAndFill('第一次把我的星星放在夜空里', '那天我意识到，如果没有人替我记住，这些路就等于没走过。')
      if (ok3) {
        await wait(400)
        if (clickByText('点亮这颗星')) log('submitted')
      }
      await waitForPhase('focused', 30000)
      await wait(4000)
      releaseDelay = 600
    } else if (scenario === 'constellation-label') {
      await loadSample()
      await waitForCameraSettle(16000)
      var labels = document.querySelectorAll('.constellation-label')
      log('constellation labels=' + labels.length)
      for (var li = 0; li < labels.length; li++) {
        if (parseFloat(labels[li].style.opacity || '0') > 0.4) {
          labels[li].click()
          log('clicked label: ' + (labels[li].textContent || '').trim())
          break
        }
      }
      await waitForPhase('focused', 40000)
      log('phase=' + (qaState() ? qaState().probe.directorPhase : '?'))
      releaseDelay = 900
    } else if (scenario === 'dense' || scenario === 'dense1000') {
      var n = scenario === 'dense1000' ? 1000 : 300
      await waitFor('.brand', 8000)
      var qd = window.__XINGLV_QA__
      if (!qd) {
        log('no qa bridge')
        await releaseHold(500)
        return
      }
      var res = await qd.importText(makeDenseArchive(n), 'replace')
      log('dense fixture n=' + n + ' ok=' + res.ok + ' total=' + qd.state().total)
      await waitForCameraSettle(20000)
      releaseDelay = 800
    } else if (scenario === 'domain') {
      await loadSample()
      await waitForCameraSettle(16000)
      if (clickByText('人生领域')) {
        await wait(700)
        log('domain legend open, rows=' + document.querySelectorAll('.dl-row').length)
        var rows = document.querySelectorAll('.dl-row')
        for (var di = 0; di < rows.length; di++) {
          if ((rows[di].textContent || '').indexOf('技术') >= 0) {
            rows[di].click()
            log('focused domain: ' + (rows[di].textContent || '').trim())
            break
          }
        }
      }
      await wait(1600)
      releaseDelay = 500
    } else if (scenario === 'guest') {
      await wait(1200)
      if (clickByText('他人星河')) {
        await wait(700)
        var cards = document.querySelectorAll('.gp-card')
        log('guest cards=' + cards.length)
        for (var gi = 0; gi < cards.length; gi++) {
          log('card ' + gi + ': ' + (cards[gi].textContent || '').replace(/\s+/g, ' ').slice(0, 60))
        }
        if (cards.length) cards[0].click()
      }
      await wait(900)
      var st2 = qaState()
      log('guest state: total=' + (st2 ? st2.total : '?') + ' guest=' + !!q('.guest-bar'))
      await waitForCameraSettle(20000)
      releaseDelay = 700
    } else if (scenario === 'guest-star') {
      await wait(1200)
      if (clickByText('他人星河')) {
        await wait(700)
        var c2 = document.querySelectorAll('.gp-card')
        if (c2.length) c2[0].click()
      }
      await waitForCameraSettle(20000)
      await huntStar(9)
      await waitForPhase('focused', 40000)
      log('guest star opened=' + !!q('.reading') + ' label=' + (q('.section-label') ? q('.section-label').textContent : ''))
      await wait(1200)
      releaseDelay = 700
    } else if (scenario === 'guest-exit') {
      await wait(1200)
      // 先在自己的星空里放一片示例，确认退出后能原样回来
      await loadSample()
      await waitForCameraSettle(16000)
      var ownBefore = qaState()
      if (clickByText('他人星河')) {
        await wait(700)
        var c3 = document.querySelectorAll('.gp-card')
        if (c3.length) c3[0].click()
      }
      await wait(1800)
      var inGuest = qaState()
      log('own before=' + ownBefore.total + ' -> guest=' + inGuest.total)
      if (clickByText('回到我的星空')) {
        await wait(1500)
      } else if (clickByText('回到我的星空')) {
        await wait(1200)
      }
      var after = qaState()
      log('after exit total=' + after.total + ' guestBar=' + !!q('.guest-bar'))
      await waitForCameraSettle(16000)
      releaseDelay = 600
    } else if (scenario === 'lives') {
      await wait(1200)
      if (location.pathname !== '/lives') history.pushState({}, '', '/lives')
      dispatchEvent(new PopStateEvent('popstate'))
      await wait(1400)
      var cards = document.querySelectorAll('.life-card')
      log('lives page: cards=' + cards.length + ' search=' + !!q('.lives-search'))
      for (var ci = 0; ci < cards.length; ci++) {
        log('  card ' + ci + ': ' + (cards[ci].querySelector('.lc-name') || {}).textContent + ' ' + (cards[ci].querySelector('.lc-meta') || {}).textContent)
      }
      // 搜索：按姓名过滤
      var input = q('.lives-search')
      if (input) {
        setValue(input, '居里')
        await wait(700)
        var filtered = document.querySelectorAll('.life-card')
        log('after search "居里": cards=' + filtered.length + ' first=' + ((filtered[0] || {}).textContent || '').slice(0, 12))
        setValue(input, '')
        await wait(500)
      }
      await wait(900)
      releaseDelay = 700
    } else if (scenario === 'life') {
      await wait(1200)
      // 如果启动时就已经落在某个 /life/xxx 上，就照它来；否则默认打开苏轼
      if (!/^\/life\//.test(location.pathname)) {
        history.pushState({}, '', '/life/su-shi')
        dispatchEvent(new PopStateEvent('popstate'))
      }
      await wait(2600)
      var st = qaState()
      log('life route: path=' + location.pathname + ' total=' + (st ? st.total : '?'))
      await waitForCameraSettle(20000)
      log('banner=' + (q('.guest-bar') ? q('.guest-bar').textContent.replace(/\s+/g, ' ').slice(0, 80) : 'none'))
      releaseDelay = 700
    } else if (scenario === 'life-star') {
      await wait(1200)
      history.pushState({}, '', '/life/einstein')
      dispatchEvent(new PopStateEvent('popstate'))
      await wait(2600)
      await waitForCameraSettle(20000)
      await huntStar(9)
      await waitForPhase('focused', 40000)
      log('life star: path=' + location.pathname + ' label=' + (q('.section-label') ? q('.section-label').textContent : ''))
      await wait(1400)
      releaseDelay = 700
    } else if (scenario === 'life-share') {
      await wait(1200)
      // 直接打开一个分享地址（模拟别人发来的链接），再刷新一次，验证刷新也能打开
      history.pushState({}, '', '/life/van-gogh')
      dispatchEvent(new PopStateEvent('popstate'))
      await wait(2600)
      var st1 = qaState()
      log('direct open /life/van-gogh: total=' + (st1 ? st1.total : '?') + ' banner=' + !!q('.guest-bar'))
      location.reload()
    } else if (scenario === 'admin-login') {
      await wait(1200)
      history.pushState({}, '', '/admin')
      dispatchEvent(new PopStateEvent('popstate'))
      await wait(1200)
      log('admin gate: login form=' + !!q('.admin-login'))
      var pw = q('.admin-login input[type=password]')
      if (pw) {
        setValue(pw, window.__XL_ADMIN_PW__ || '')
        await wait(300)
        var btn = q('.admin-login button[type=submit]')
        if (btn) btn.click()
      }
      await wait(1800)
      var rows = document.querySelectorAll('.admin-row')
      log('after login: rows=' + rows.length + ' error=' + (q('.admin-error') ? q('.admin-error').textContent : 'none'))
      for (var ri = 0; ri < rows.length; ri++) log('  row ' + ri + ': ' + (rows[ri].textContent || '').replace(/\s+/g, ' ').slice(0, 70))
      await wait(600)
      releaseDelay = 700
    } else if (scenario === 'admin-save') {
      await wait(1200)
      history.pushState({}, '', '/admin')
      dispatchEvent(new PopStateEvent('popstate'))
      await wait(1200)
      var pw2 = q('.admin-login input[type=password]')
      if (pw2) {
        setValue(pw2, window.__XL_ADMIN_PW__ || '')
        var b2 = q('.admin-login button[type=submit]')
        if (b2) b2.click()
      }
      await wait(1800)
      // 新增一位人物并保存，然后去公开列表确认它出现了
      var addBtn = null
      var acts = document.querySelectorAll('.admin-head-actions button')
      for (var ai = 0; ai < acts.length; ai++) if ((acts[ai].textContent || '').indexOf('新增人物') >= 0) addBtn = acts[ai]
      if (addBtn) addBtn.click()
      await wait(900)
      var inputs = document.querySelectorAll('.field-grid input')
      log('editor opened: inputs=' + inputs.length)
      // 依次填：姓名 / 网址 id / 生年 / 卒年 / 一句定位
      var fill = function (idx, value) { if (inputs[idx]) setValue(inputs[idx], value) }
      fill(0, '验收人物')
      fill(1, 'qa-person')
      fill(2, '1900')
      fill(3, '1980')
      fill(4, '由验收脚本创建的临时人物')
      await wait(300)
      var addAch = null
      var links = document.querySelectorAll('.editor-block-head .link-btn')
      for (var li = 0; li < links.length; li++) if ((links[li].textContent || '').indexOf('增加一条成就') >= 0) addAch = links[li]
      if (addAch) addAch.click()
      await wait(500)
      var when = q('.ach-when')
      var title = q('.ach-title')
      var ctx = q('.ach-context')
      if (when) setValue(when, '1925')
      if (title) setValue(title, '验收用的第一条成就')
      if (ctx) setValue(ctx, '（史实背景）这是验收脚本写入的临时条目，验收结束后会被删除。')
      await wait(400)
      var saveBtn = q('.editor-savebar button')
      if (saveBtn) saveBtn.click()
      await wait(2200)
      log('saved; notice=' + (q('.admin-ok') ? q('.admin-ok').textContent : 'none'))
      // 公开接口应当立刻能看到
      try {
        var res = await fetch('/api/lives', { credentials: 'same-origin' })
        var data = await res.json()
        var found = (data.lives || []).filter(function (l) { return l.id === 'qa-person' })
        log('public list has qa-person=' + (found.length > 0) + ' total=' + (data.lives || []).length)
      } catch (e) {
        log('public list check failed: ' + e)
      }
      await wait(600)
      releaseDelay = 700
    } else if (scenario === 'admin-unpublish') {
      await wait(1200)
      history.pushState({}, '', '/admin')
      dispatchEvent(new PopStateEvent('popstate'))
      await wait(1200)
      var pw3 = q('.admin-login input[type=password]')
      if (pw3) {
        setValue(pw3, window.__XL_ADMIN_PW__ || '')
        var b3 = q('.admin-login button[type=submit]')
        if (b3) b3.click()
      }
      await wait(1800)
      // 撤下 qa-person，再确认公开列表里看不到、管理端仍看得到
      var rows2 = document.querySelectorAll('.admin-row')
      for (var xi = 0; xi < rows2.length; xi++) {
        if ((rows2[xi].textContent || '').indexOf('qa-person') >= 0) {
          var editBtn = rows2[xi].querySelector('.link-btn')
          if (editBtn) editBtn.click()
          break
        }
      }
      await wait(1100)
      var pub = q('.field-grid .check input')
      if (pub && pub.checked) pub.click()
      await wait(300)
      var save2 = q('.editor-savebar button')
      if (save2) save2.click()
      await wait(2200)
      try {
        var res2 = await fetch('/api/lives', { credentials: 'same-origin' })
        var data2 = await res2.json()
        log('after unpublish: public has qa-person=' + (data2.lives || []).some(function (l) { return l.id === 'qa-person' }))
        var res3 = await fetch('/api/admin/lives', { credentials: 'same-origin' })
        var data3 = await res3.json()
        log('admin still has it=' + (data3.lives || []).some(function (l) { return l.id === 'qa-person' }))
      } catch (e) {
        log('check failed: ' + e)
      }
      await wait(500)
      releaseDelay = 700
    } else if (scenario === 'anon-guard') {
      await wait(1500)
      // 匿名访客：读公开数据应当成功，写与读管理接口应当失败
      var out = []
      try {
        var r1 = await fetch('/api/lives', { credentials: 'same-origin' })
        var d1 = await r1.json()
        out.push('public list ' + r1.status + ' n=' + (d1.lives || []).length)
      } catch (e) { out.push('public list failed ' + e) }
      try {
        var r2 = await fetch('/api/admin/lives', { credentials: 'same-origin' })
        out.push('admin list ' + r2.status)
      } catch (e) { out.push('admin list failed ' + e) }
      try {
        var r3 = await fetch('/api/admin/lives/qa-person', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: 'qa-person', name: 'HACKED', achievements: [] }),
        })
        out.push('anonymous PUT ' + r3.status)
      } catch (e) { out.push('anonymous PUT failed ' + e) }
      try {
        var r4 = await fetch('/api/admin/lives', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: 'hacked', name: 'HACKED', achievements: [] }),
        })
        out.push('anonymous POST ' + r4.status)
      } catch (e) { out.push('anonymous POST failed ' + e) }
      // 个人成就是否出现在任何公开接口里
      out.push('personal archive exported keys=' + Object.keys(window.__XINGLV_QA__.state()).join(','))
      for (var oi = 0; oi < out.length; oi++) log(out[oi])
      await wait(600)
      releaseDelay = 700
    } else if (scenario === 'errors') {
      await wait(1500)
      history.pushState({}, '', window.__XL_ERRORS_PATH__ || '/life/su-shi')
      dispatchEvent(new PopStateEvent('popstate'))
      await wait(3000)
      var errs = window.__XL_ERRORS__ || []
      log('errors=' + errs.length)
      for (var ei = 0; ei < Math.min(errs.length, 6); ei++) log('  #' + ei + ' ' + String(errs[ei]).slice(0, 220))
      var st3 = qaState()
      log('state total=' + (st3 ? st3.total : '?') + ' canvas=' + !!document.querySelector('canvas') + ' hud=' + !!q('.brand'))
      await wait(600)
      releaseDelay = 500
    } else if (scenario === 'life-domain') {
      await wait(1200)
      history.pushState({}, '', '/life/su-shi')
      dispatchEvent(new PopStateEvent('popstate'))
      await wait(2600)
      await waitForCameraSettle(20000)
      if (clickByText('人生领域')) {
        await wait(700)
        var drows = document.querySelectorAll('.dl-row')
        log('domain legend rows=' + drows.length)
        for (var dj = 0; dj < drows.length; dj++) {
          if ((drows[dj].textContent || '').indexOf('创作') >= 0) {
            drows[dj].click()
            log('person sky domain focus -> ' + (drows[dj].textContent || '').trim())
            break
          }
        }
      }
      await wait(2200)
      releaseDelay = 700
    } else if (scenario === 'date-precision') {
      await wait(1200)
      // 用管理接口造一位临时人物，三条成就分别只填年 / 填到月 / 填到日，
      // 再在真实界面里逐条打开，读它**渲染出来的**日期文本。
      var login = await fetch('/api/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: window.__XL_ADMIN_PW__ || '' }),
      })
      log('admin login ' + login.status)
      var doc = {
        id: 'qa-day',
        name: '精度验收',
        tagline: '临时人物',
        summary: '用于验收日期精度，验收后自动删除。',
        birthYear: 1900,
        deathYear: 1980,
        provenance: '验收用',
        importanceRule: '验收用',
        published: true,
        journeys: [],
        achievements: [
          { id: 'ach-qa-day-0', title: '只填了年份', when: '1900', domain: 'academy', pivotal: false, context: '验收用。', source: '' },
          { id: 'ach-qa-day-1', title: '填到了月份', when: '1900-06', domain: 'academy', pivotal: false, context: '验收用。', source: '' },
          { id: 'ach-qa-day-2', title: '填到了具体日期', when: '1900-06-15', domain: 'academy', pivotal: false, context: '验收用。', source: '' },
        ],
      }
      var created = await fetch('/api/admin/lives', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(doc),
      })
      log('create qa-day ' + created.status)
      history.pushState({}, '', '/life/qa-day')
      dispatchEvent(new PopStateEvent('popstate'))
      await wait(2800)
      var stp = qaState()
      log('opened /life/qa-day total=' + (stp ? stp.total : '?'))
      for (var di = 0; di < 3; di++) {
        window.__XINGLV_QA__.focus('ach-qa-day-' + di)
        await wait(900)
        var panel = q('.reading')
        var first = panel ? panel.querySelector('.meta-row span') : null
        log('  when="' + ['1900', '1900-06', '1900-06-15'][di] + '" -> 显示「' + (first ? first.textContent : '?') + '」')
        var closeBtn = panel ? panel.querySelector('.close-x') : null
        if (closeBtn) closeBtn.click()
        await wait(500)
      }
      // 清理：验收数据不该留在公开名人库里
      var del = await fetch('/api/admin/lives/qa-day', { method: 'DELETE', credentials: 'same-origin' })
      log('cleanup delete ' + del.status)
      var pub2 = await (await fetch('/api/lives', { credentials: 'same-origin' })).json()
      log('public list still has qa-day=' + (pub2.lives || []).some(function (l) { return l.id === 'qa-day' }) + ' total=' + (pub2.lives || []).length)
      history.pushState({}, '', '/lives')
      dispatchEvent(new PopStateEvent('popstate'))
      await wait(1200)
      releaseDelay = 700
    } else if (scenario === 'pure') {
      // 等引导语自己退场，拍「星空常态」：这一帧里除了器物，一个字都不该有
      await waitForCameraSettle(22000)
      await wait(10000)
      var texts = []
      document.querySelectorAll('.xinglv-overlay *').forEach(function (el) {
        if (!el.children.length && el.textContent && el.textContent.trim() && el.offsetParent !== null) {
          var r = el.getBoundingClientRect()
          // 只关心落在星空中部区域（避开四角器物）的文字
          if (r.left > window.innerWidth * 0.18 && r.right < window.innerWidth * 0.86 && r.top > window.innerHeight * 0.12 && r.bottom < window.innerHeight * 0.82) {
            texts.push(el.textContent.trim().slice(0, 24))
          }
        }
      })
      log('星空中部区域的文字节点=' + texts.length + (texts.length ? ' -> ' + texts.join(' | ') : ''))
      log('whisper=' + !!q('.whisper') + ' labels=' + document.querySelectorAll('.constellation-label').length)
      releaseDelay = 700
    } else if (scenario === 'constellation-pick') {
      // 星空里不再有任何文字标注，星座改由「直接点那团星」进入。
      // 这里用与拾取同一套投影找出某个人生星座的位置，再派发真实指针事件。
      await loadSample()
      await waitForCameraSettle(20000)
      var found = null
      for (var gy = 0.15; gy <= 0.85 && !found; gy += 0.02) {
        for (var gx = 0.12; gx <= 0.88 && !found; gx += 0.02) {
          var px = Math.round(window.innerWidth * gx)
          var py = Math.round(window.innerHeight * gy)
          var hit = window.__XINGLV_QA__.pickAt(px, py)
          if (hit && hit.kind === 'constellation') found = { x: px, y: py, id: hit.id, title: hit.title }
        }
      }
      log('found constellation hit=' + (found ? found.id + ' @' + found.x + ',' + found.y : 'none'))
      if (found) {
        var el = document.querySelector('canvas')
        var opts = { bubbles: true, cancelable: true, clientX: found.x, clientY: found.y, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }
        el.dispatchEvent(new PointerEvent('pointerdown', opts))
        el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, opts, { buttons: 0 })))
        await wait(1200)
        var panel = q('.reading')
        log('constellation panel=' + !!panel + ' title=' + (panel && panel.querySelector('.panel-title') ? panel.querySelector('.panel-title').textContent : '?'))
      }
      await wait(1500)
      releaseDelay = 700
    } else if (scenario === 'overview-constellation') {
      // 星空里没有任何文字，星座入口在「星河概览」面板：点一行 → 聚焦那一团星
      await loadSample()
      await waitForCameraSettle(20000)
      var eye = null
      var btns = document.querySelectorAll('.side-tools .round-btn')
      if (btns.length >= 3) eye = btns[2]
      log('side buttons=' + btns.length + ' eye=' + !!eye)
      if (eye) eye.click()
      await wait(1200)
      var rows = document.querySelectorAll('.reading .constellation-item')
      log('overview panel constellations=' + rows.length)
      for (var oi = 0; oi < rows.length; oi++) log('  row ' + oi + ': ' + (rows[oi].textContent || '').replace(/\s+/g, ' ').trim())
      if (rows.length) {
        rows[0].click()
        await wait(2200)
        var p2 = q('.reading')
        log('after click: panel=' + !!p2 + ' title=' + (p2 && p2.querySelector('.panel-title') ? p2.querySelector('.panel-title').textContent : '?') + ' phase=' + (qaState() || {}).phase)
      }
      await wait(1200)
      releaseDelay = 700
    } else if (scenario === 'arrival-mid' || scenario === 'arrival-done') {
      // 验证「面板随镜头抵达」：飞行途中面板必须在，但完全不可见；
      // 抵达之后才浮现，并且内容依次上浮。
      await loadSample()
      await waitForCameraSettle(20000)
      var probe = null
      var listxy = window.__XINGLV_QA__.starScreenXY()
      var w0 = innerWidth
      var h0 = innerHeight
      for (var si = 0; si < listxy.length; si++) {
        var st = listxy[si]
        if (st.x > w0 - 230 || st.y > h0 - 150 || st.y < 80 || st.x < 30) continue
        // 取一颗偏离画面正中的星：飞行距离长一点，过渡更容易看清
        if (!probe || Math.abs(st.x - w0 / 2) > Math.abs(probe.x - w0 / 2)) probe = st
      }
      log('probe star=' + (probe ? probe.title + ' @' + Math.round(probe.x) + ',' + Math.round(probe.y) : 'none'))
      if (!probe) { releaseDelay = 300; return }
      var probePt = { x: probe.x, y: probe.y }
      var cv = document.querySelector('canvas')
      var o = { bubbles: true, cancelable: true, clientX: probePt.x, clientY: probePt.y, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }
      cv.dispatchEvent(new PointerEvent('pointerdown', o))
      cv.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, o, { buttons: 0 })))
      var arrT0 = performance.now()
      var readState = function (tag) {
        var el = q('.reading')
        if (!el) { log('  ' + tag + ' +' + Math.round(performance.now() - arrT0) + 'ms  reading=none'); return }
        var cs = getComputedStyle(el)
        log('  ' + tag + ' +' + Math.round(performance.now() - arrT0) + 'ms  is-in=' + el.classList.contains('is-in') + ' opacity=' + cs.opacity + ' translate=' + cs.translate + ' blur=' + cs.filter)
      }
      await wait(400)
      readState('飞行中')
      if (scenario === 'arrival-mid') {
        await wait(900)
        readState('飞行中')
      } else {
        // 采样浮现过程：要看到它渐变上去，而不是一步跳到位
        var sawIn = false
        for (var k = 0; k < 30 && !sawIn; k++) {
          var e0 = q('.reading')
          if (e0 && e0.classList.contains('is-in')) sawIn = true
          else await wait(140)
        }
        log('浮现开始（is-in）=' + sawIn)
        for (var m = 0; m < 7; m++) {
          readState('浮现中')
          await wait(150)
        }
        var panel = q('.reading')
        log('  title=' + (panel && panel.querySelector('.reading-title') ? panel.querySelector('.reading-title').textContent : '?'))
      }
      await wait(400)
      releaseDelay = 500
    } else if (scenario === 'jitter') {
      // 量「上下动」到底来自哪一层：面板本体、面板里的字、还是镜头里的星
      await loadSample()
      await waitForCameraSettle(20000)
      var list2 = window.__XINGLV_QA__.starScreenXY()
      var tgt = null
      for (var s2 = 0; s2 < list2.length; s2++) {
        var st2 = list2[s2]
        if (st2.x > innerWidth - 230 || st2.y > innerHeight - 150 || st2.y < 90) continue
        if (!tgt || st2.y > tgt.y) tgt = st2
      }
      if (!tgt) { log('no target'); releaseDelay = 300; return }
      var cvs = document.querySelector('canvas')
      var oo = { bubbles: true, cancelable: true, clientX: tgt.x, clientY: tgt.y, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }
      cvs.dispatchEvent(new PointerEvent('pointerdown', oo))
      cvs.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, oo, { buttons: 0 })))
      var jt0 = performance.now()
      var targetId = (qaState() || {}).focusedStarId
      var line = ''
      var sample = function (tag) {
        var rel = q('.reading')
        var pan = rel ? Math.round(rel.getBoundingClientRect().top) : -1
        var tit = rel && rel.querySelector('.reading-title') ? Math.round(rel.querySelector('.reading-title').getBoundingClientRect().top) : -1
        var stt = rel && rel.querySelector('.story') ? Math.round(rel.querySelector('.story').getBoundingClientRect().top) : -1
        var sy = -1
        var xy = window.__XINGLV_QA__.starScreenXY()
        for (var q2 = 0; q2 < xy.length; q2++) if (xy[q2].id === targetId) sy = Math.round(xy[q2].y)
        line = tag + ' +' + Math.round(performance.now() - jt0) + 'ms panelTop=' + pan + ' titleTop=' + tit + ' storyTop=' + stt + ' starY=' + sy + ' op=' + (rel ? getComputedStyle(rel).opacity : '-')
        log('  ' + line)
      }
      // 先等镜头真正停稳（phase=focused），再连采几次：
      // 这样量到的是「抵达之后有没有抖」，而不是飞行途中本来就该有的位移。
      for (var w1 = 0; w1 < 60; w1++) {
        var pr = (qaState() || {}).probe
        if (pr && pr.directorPhase === 'focused') break
        await wait(300)
      }
      for (var q1 = 0; q1 < 5; q1++) {
        sample('停稳后')
        await wait(260)
      }
      releaseDelay = 500
    } else if (scenario === 'reading-geom') {
      // 量故事面板的几何：正文有没有溢出、被谁裁掉
      await loadSample()
      await waitForCameraSettle(20000)
      var lst = window.__XINGLV_QA__.starScreenXY()
      var pick2 = null
      for (var g1 = 0; g1 < lst.length; g1++) {
        var s3 = lst[g1]
        if (s3.x > innerWidth - 60 || s3.y > innerHeight - 140 || s3.y < 90) continue
        if (!pick2) pick2 = s3
      }
      if (!pick2) { log('no star'); releaseDelay = 300; return }
      var cv3 = document.querySelector('canvas')
      var o3 = { bubbles: true, cancelable: true, clientX: pick2.x, clientY: pick2.y, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }
      cv3.dispatchEvent(new PointerEvent('pointerdown', o3))
      cv3.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, o3, { buttons: 0 })))
      for (var w3 = 0; w3 < 60; w3++) {
        var pr3 = (qaState() || {}).probe
        if (pr3 && pr3.directorPhase === 'focused') break
        await wait(300)
      }
      await wait(1200)
      var vw = innerWidth
      var vh = innerHeight
      log('viewport ' + vw + 'x' + vh)
      ;['.reading', '.reading-scroll', '.story', '.reading-actions'].forEach(function (sel) {
        var el = q(sel)
        if (!el) { log('  ' + sel + ' = absent'); return }
        var r = el.getBoundingClientRect()
        var cs = getComputedStyle(el)
        log('  ' + sel + ' rect=' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) +
          ' client=' + el.clientWidth + ' scroll=' + el.scrollWidth +
          ' ws=' + cs.whiteSpace + ' ox=' + cs.overflowX + ' pad=' + cs.paddingLeft + '/' + cs.paddingRight +
          ' overflowRight=' + Math.round(r.right - vw))
      })
      document.querySelectorAll('.story').forEach(function (el, i) {
        var r = el.getBoundingClientRect()
        log('  story[' + i + '] right=' + Math.round(r.right) + ' scrollW=' + el.scrollWidth + ' clientW=' + el.clientWidth)
      })
      releaseDelay = 500
    } else if (scenario === 'arm-spread') {
      // 量「成就星有没有被铺满整片盘面」：
      // 对每颗星算出它离最近那道星臂脊线的角距离，再看分布。
      await wait(1500)
      var tw = window.__XINGLV_QA__.starWorld()
      var arms = window.__XINGLV_QA__.armAngles()
      var gc = window.__XINGLV_QA__.galaxyConstants()
      var hist = [0, 0, 0, 0, 0, 0] // 0–0.1 / 0.1–0.2 / 0.2–0.31 / 0.31–0.45 / 0.45–0.6 / >0.6 rad
      var lats = []
      var byDomain = {}
      for (var i = 0; i < tw.length; i++) {
        var s = tw[i]
        var r = Math.hypot(s.x, s.z)
        var th = Math.atan2(s.z, s.x)
        // 这颗星「应该」在哪道臂上：取离它最近的脊线（含 WIND·t 的缠绕）
        var best = 9
        for (var a = 0; a < arms.length; a++) {
          var ridge = arms[a] + gc.WIND * s.time
          var d = th - ridge
          d = Math.atan2(Math.sin(d), Math.cos(d))
          if (Math.abs(d) < Math.abs(best)) best = d
        }
        var ad = Math.abs(best)
        lats.push(ad)
        var bi = ad < 0.1 ? 0 : ad < 0.2 ? 1 : ad < 0.31 ? 2 : ad < 0.45 ? 3 : ad < 0.6 ? 4 : 5
        hist[bi]++
        var kl = s.domain + '@' + Math.round(r)
        byDomain[kl] = (byDomain[kl] ?? 0) + 1
      }
      lats.sort(function (x, y) { return x - y })
      var median = lats.length ? lats[Math.floor(lats.length / 2)] : 0
      var mean = lats.reduce(function (x, y) { return x + y }, 0) / Math.max(1, lats.length)
      var between = hist[3] + hist[4] + hist[5]
      log('星数=' + tw.length + '  中位角距=' + median.toFixed(3) + 'rad  平均=' + mean.toFixed(3) + 'rad')
      log('角距分布（rad）：<0.10 ' + hist[0] + ' | 0.10-0.20 ' + hist[1] + ' | 0.20-0.31 ' + hist[2] +
        ' | 0.31-0.45 ' + hist[3] + ' | 0.45-0.60 ' + hist[4] + ' | >0.60 ' + hist[5])
      // ★ 阈值说明：10 条臂间距 0.628 rad，任何点到最近脊线的角距**最大只有 0.314**，
      // 所以「>0.31」这个判据天然接近 0，测不出散落。真正有意义的阈值是臂间距的一半（0.157）：
      // 均匀盘族会有一半落在外侧，紧贴星臂的分布则很少。
      var outer = 0
      for (var i2 = 0; i2 < lats.length; i2++) if (lats[i2] > 0.157) outer++
      log('落在外侧半格(>0.157rad，均匀分布应约 50%)：' + outer + ' / ' + tw.length + ' = ' + Math.round((outer / Math.max(1, tw.length)) * 100) + '%')
      log('极端离臂(>0.31rad，理论上限 0.314)：' + between + ' / ' + tw.length + ' = ' + Math.round((between / Math.max(1, tw.length)) * 100) + '%')
      // 同一领域内「离自己那道臂」的角向标准差 —— 越小说明越挤在一条线上
      var offsets = {}
      for (var k2 = 0; k2 < tw.length; k2++) {
        var sk = tw[k2]
        var rk = Math.hypot(sk.x, sk.z)
        var thk = Math.atan2(sk.z, sk.x)
        var bk = 9
        for (var a2 = 0; a2 < arms.length; a2++) {
          var ridge2 = arms[a2] + gc.WIND * sk.time
          var d2 = thk - ridge2
          d2 = Math.atan2(Math.sin(d2), Math.cos(d2))
          if (Math.abs(d2) < Math.abs(bk)) bk = d2
        }
        ;(offsets[sk.domain] = offsets[sk.domain] ?? []).push(bk)
      }
      Object.keys(offsets).forEach(function (d) {
        var arr = offsets[d]
        var m = arr.reduce(function (x, y) { return x + y }, 0) / arr.length
        var v = arr.reduce(function (x, y) { return x + (y - m) * (y - m) }, 0) / arr.length
        log('  ' + d + ' n=' + arr.length + ' 离脊线σ=' + Math.sqrt(v).toFixed(3) + 'rad')
      })
      releaseDelay = 500
    } else if (scenario === 'sample-return') {
      // 验证「示例不会吞掉我自己的星空」这条路：
      // 造一份自己的记录 → 切到示例 → 点「回到我的星空」→ 必须回到自己的那颗星
      var qa2 = window.__XINGLV_QA__
      var own = {
        schemaVersion: 1,
        achievements: [
          {
            id: 'ach_own_1',
            title: '我自己的第一颗星',
            happenedAt: '2024-05-01',
            reflection: '这条是测试用的，不属于示例。',
            domain: 'craft',
            importance: 3,
            resonance: 0,
            createdAt: '2024-05-01T00:00:00.000Z',
            updatedAt: '2024-05-01T00:00:00.000Z',
          },
        ],
        journeys: [],
        createdAt: '2024-05-01T00:00:00.000Z',
        updatedAt: '2024-05-01T00:00:00.000Z',
      }
      var r1 = await qa2.importText(JSON.stringify(own), 'replace')
      await wait(900)
      var ids1 = window.__XINGLV_QA__.starWorld().map(function (s) { return s.id })
      log('① 导入自己的记录：ok=' + r1.ok + ' 星数=' + qaState().total + ' id=' + ids1.join(','))

      // 真正在界面里点「先看看一片示例星河」需要回到空档案的进入页；
      // 这里直接用与那个按钮同一条 store 动作，效果等价。
      await qa2.loadSample()
      await wait(1600)
      var ids2 = window.__XINGLV_QA__.starWorld().map(function (s) { return s.id })
      var isSampleNow = ids2.length > 0 && ids2.every(function (id) { return /^ach_sample_/.test(id) })
      log('② 切到示例：星数=' + qaState().total + ' 全部是示例的星=' + isSampleNow)

      // 顶部横幅上应该出现「示例星空 / 仅供体验 · 不是你自己的记录」+「回到我的星空」
      var hudText = (q('.hud') || document.body).textContent || ''
      log('③ 横幅是否说明不是你自己的：' + /不是你自己的记录/.test(hudText))
      var back = null
      var btns2 = Array.prototype.slice.call(document.querySelectorAll('button'))
      for (var b2 = 0; b2 < btns2.length; b2++) if (/回到我的星空/.test(btns2[b2].textContent || '')) back = btns2[b2]
      if (!back) { log('④ 找不到「回到我的星空」按钮'); releaseDelay = 300; return }
      var br = back.getBoundingClientRect()
      log('④ 出口按钮可见：' + (br.width > 0 && br.height > 0) + ' ' + Math.round(br.left) + ',' + Math.round(br.top))
      back.click()
      // 恢复要「读快照 → 写库 → 重排星图」，比一次 React 渲染慢得多：轮询到状态真的变了
      var ids3 = []
      for (var w4 = 0; w4 < 24; w4++) {
        await wait(600)
        ids3 = window.__XINGLV_QA__.starWorld().map(function (s) { return s.id })
        if (ids3.length === 1 && ids3[0] === 'ach_own_1') break
      }
      log('⑤ 点完之后：星数=' + qaState().total + ' id=' + ids3.join(',').slice(0, 60))
      log('⑥ 我自己的星空回来了：' + (qaState().total === 1 && ids3.length === 1 && ids3[0] === 'ach_own_1'))
      releaseDelay = 500
    } else if (scenario === 'my-stars') {
      // 删除自己的成就：单删 / 批量删 / 撤销 / 旅程变空要一起清掉
      var qa3 = window.__XINGLV_QA__
      var mk = function (n, jid) {
        return {
          id: 'ach_t' + n,
          title: '测试记录 ' + n,
          happenedAt: '202' + (n % 4) + '-0' + ((n % 8) + 1) + '-01',
          reflection: '',
          domain: 'craft',
          importance: 3,
          resonance: 0,
          journeyId: jid,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        }
      }
      var recs = { schemaVersion: 1, achievements: [mk(1, 'j1'), mk(2, 'j1'), mk(3, 'j1'), mk(4, 'j2')],
        journeys: [
          { id: 'j1', name: '一段旅程', createdAt: '2024-01-01T00:00:00.000Z' },
          { id: 'j2', name: '只有一颗星的旅程', createdAt: '2024-01-01T00:00:00.000Z' },
        ], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }
      await qa3.importText(JSON.stringify(recs), 'replace')
      await wait(1200)
      log('① 准备：星=' + qaState().total + ' 旅程=' + qaState().journeys)

      // 打开「来时路」
      var top = Array.prototype.slice.call(document.querySelectorAll('.topbar button, .hud button, button'))
      var pathBtn = null
      for (var t1 = 0; t1 < top.length; t1++) if (/来时路/.test(top[t1].textContent || '')) pathBtn = top[t1]
      if (!pathBtn) { log('② 找不到「来时路」入口'); releaseDelay = 300; return }
      pathBtn.click()
      var panelOpen = false
      for (var w5 = 0; w5 < 30; w5++) {
        await wait(400)
        var rel2 = q('.reading')
        if (rel2 && rel2.classList.contains('is-in')) { panelOpen = true; break }
      }
      log('② 来时路面板就绪：' + panelOpen)
      var rows = document.querySelectorAll('.reading-scroll .path-row').length
      log('   列表行数=' + rows + '（应为 4）')

      // 单删第一行
      var del1 = document.querySelector('.reading-scroll .path-row .row-del')
      if (!del1) { log('③ 找不到行内删除按钮'); releaseDelay = 300; return }
      del1.click()
      for (var w6 = 0; w6 < 20; w6++) { await wait(400); if (qaState().total === 3) break }
      log('③ 单删一颗后：星=' + qaState().total + ' 旅程=' + qaState().journeys + '（删除 j2 那颗则旅程应变 1）')
      var hasUndo = !!q('.reading-scroll .undo-bar')
      log('④ 出现「撤销」条：' + hasUndo)

      // 撤销
      var undoBtn = q('.reading-scroll .undo-bar .link-btn')
      if (undoBtn) undoBtn.click()
      for (var w7 = 0; w7 < 20; w7++) { await wait(400); if (qaState().total === 4) break }
      log('⑤ 撤销后：星=' + qaState().total + ' 旅程=' + qaState().journeys + '（应回到 4 / 2）')

      // 批量删除：进入管理态 → 全选 → 删除所选 → 确认
      var ghost = Array.prototype.slice.call(document.querySelectorAll('.reading .ghost-btn'))
      if (ghost[0]) ghost[0].click()
      await wait(700)
      var linkBtns = Array.prototype.slice.call(document.querySelectorAll('.manage-bar .link-btn'))
      var allBtn = null
      for (var t2 = 0; t2 < linkBtns.length; t2++) if (/全选/.test(linkBtns[t2].textContent || '')) allBtn = linkBtns[t2]
      if (allBtn) allBtn.click()
      await wait(500)
      log('⑥ 全选后：' + (document.querySelector('.manage-bar .mb-count') || {}).textContent)
      var delSel = null
      var lb2 = Array.prototype.slice.call(document.querySelectorAll('.manage-bar .link-btn'))
      for (var t3 = 0; t3 < lb2.length; t3++) if (/删除所选/.test(lb2[t3].textContent || '')) delSel = lb2[t3]
      if (delSel) delSel.click()
      await wait(600)
      var confirmBtn = null
      var lb3 = Array.prototype.slice.call(document.querySelectorAll('.manage-bar .link-btn'))
      for (var t4 = 0; t4 < lb3.length; t4++) if (/确认删除/.test(lb3[t4].textContent || '')) confirmBtn = lb3[t4]
      log('⑦ 二次确认按钮：' + (confirmBtn ? confirmBtn.textContent.trim() : '缺失'))
      if (confirmBtn) confirmBtn.click()
      for (var w8 = 0; w8 < 24; w8++) { await wait(400); if (qaState().total === 0) break }
      log('⑧ 批量删除后：星=' + qaState().total + ' 旅程=' + qaState().journeys + '（都应为 0）')

      var undo2 = q('.reading-scroll .undo-bar .link-btn')
      log('⑨ 还能撤销：' + !!undo2)
      if (undo2) undo2.click()
      for (var w9 = 0; w9 < 24; w9++) { await wait(400); if (qaState().total === 4) break }
      log('⑩ 撤销批量删除后：星=' + qaState().total + ' 旅程=' + qaState().journeys + '（应回到 4 / 2）')
      releaseDelay = 500
    } else if (scenario === 'autoplay') {
      // 时间轴自动播放：真的在走 / 倍率生效 / 暂停会停 / 到终点停住 / 拖动会暂停
      var qa4 = window.__XINGLV_QA__
      var recs = []
      for (var i = 1; i <= 40; i++) {
        var y = 1990 + Math.floor(i / 2)
        recs.push({
          id: 'ach_ap' + i,
          title: '自动播放测试 ' + i,
          happenedAt: y + '-' + String((i % 12) + 1).padStart(2, '0') + '-01',
          reflection: '',
          domain: 'craft',
          importance: 3,
          resonance: 0,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        })
      }
      await qa4.importText(JSON.stringify({ schemaVersion: 1, achievements: recs, journeys: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }), 'replace')
      await wait(1200)
      // 让时间轴显示出来
      var tlToggle = document.querySelector('.tl-play')
      for (var w10 = 0; w10 < 20 && !tlToggle; w10++) { await wait(400); tlToggle = document.querySelector('.tl-play') }
      if (!tlToggle) { log('找不到时间轴'); releaseDelay = 300; return }
      qa4.setObs(0.05)
      await wait(600)
      log('① 起点 obsTime=' + qaState().obsTime + ' 播放中=' + qaState().obsPlaying)

      // 播放
      tlToggle.click()
      await wait(2200)
      var a = qaState().obsTime
      var playing = qaState().obsPlaying
      log('② 按播放 2.2 秒后 obsTime=' + a + ' 播放中=' + playing + '（应明显 > 0.05）')

      // 换成 4×
      var sp = document.querySelector('.tl-speed')
      var before = qaState().obsTime
      sp.click(); sp.click() // 1 -> 2 -> 4
      var spText = sp.textContent.trim()
      await wait(2000)
      var after = qaState().obsTime
      log('③ 切到 ' + spText + ' 后 2 秒推进了 ' + (after - before).toFixed(4) + '（1× 时约 0.067）')

      // 暂停
      tlToggle.click()
      await wait(300)
      var p1 = qaState().obsTime
      var paused = qaState().obsPlaying
      await wait(1500)
      var p2 = qaState().obsTime
      log('④ 暂停后 1.5 秒：' + p1 + ' -> ' + p2 + ' 播放中=' + paused + '（应完全不变）')

      // 跳到接近终点再播放，应该走到 1 就停
      qa4.setObs(0.97)
      await wait(400)
      tlToggle.click()
      for (var w11 = 0; w11 < 30; w11++) { await wait(300); if (!qaState().obsPlaying) break }
      log('⑤ 从 0.97 播放到终点：obsTime=' + qaState().obsTime + ' 播放中=' + qaState().obsPlaying + '（应停在 1 且已停）')

      // 在终点再按播放 → 从头开始
      tlToggle.click()
      await wait(700)
      log('⑥ 终点再按播放：obsTime=' + qaState().obsTime + ' 播放中=' + qaState().obsPlaying + '（应从头、且在播）')

      // 拖动应暂停
      var track = document.querySelector('.tl-track')
      var r0 = track.getBoundingClientRect()
      track.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r0.left + r0.width * 0.4, clientY: r0.top + 5, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }))
      await wait(400)
      log('⑦ 拖动之后 播放中=' + qaState().obsPlaying + '（应为 false）')

      // 界面读数
      var st = qaState()
      var spanYears = (st.frameEndMs - st.frameOriginMs) / (365.25 * 86400000)
      var shown = (document.querySelector('.tl-speed-hint') || {}).textContent
      var expect = (spanYears * st.obsSpeed) / 30
      log('   刻度跨度：' + spanYears.toFixed(1) + ' 年（' + new Date(st.frameOriginMs).getFullYear() + '–' + new Date(st.frameEndMs).getFullYear() + '）')
      log('   速度=' + st.obsSpeed + 'x，按公式应为 ' + expect.toFixed(1) + ' 年/秒')
      log('   界面读数：' + shown)
      log('   读数是否正确：' + (shown.indexOf(String(expect >= 2 ? expect.toFixed(1) : (expect * 12).toFixed(1))) >= 0))
      // 连点两次速度按钮，应真的进两档
      var sp2 = document.querySelector('.tl-speed')
      var s0 = qaState().obsSpeed
      sp2.click()
      await wait(300)
      var s1 = qaState().obsSpeed
      sp2.click()
      await wait(300)
      var s2 = qaState().obsSpeed
      log('⑧ 连点两次速度：' + s0 + ' → ' + s1 + ' → ' + s2 + '（分两步就该进两档）')
      releaseDelay = 500
    } else if (scenario === 'flight') {
      // 转场验收：★ 按时间采样镜头状态，而不是截图。
      // 无头环境里连续截图拿到的可能是同一帧（实测连拍 6 张完全一致），
      // 但镜头每帧都在动 —— 所以「掠过盘面」这件事必须用数据来证明。
      var qa5 = window.__XINGLV_QA__
      await loadSample()
      await waitForCameraSettle(20000)
      var st0 = qa5.camera()
      log('起飞前：phase=' + st0.phase + ' r=' + st0.r + ' y=' + st0.y)

      var list = qa5.starWorld()
      var pick = null
      for (var i = 0; i < list.length; i++) {
        if (Math.hypot(list[i].x, list[i].z) > 5 && list[i].y > -1) { pick = list[i]; break }
      }
      if (!pick) { log('没有可用的目标星'); releaseDelay = 300; return }
      log('目标星 ' + pick.id + '  r=' + Math.hypot(pick.x, pick.z).toFixed(2))

      qa5.focus(pick.id)
      // ★ 在页面内用 rAF 逐帧记录。
      // 驱动器的 setTimeout 在这个环境里会被主线程拖到 ~600ms 一次，
      // 一次 2.5 秒的飞行只能采到 4 个点，根本看不出轨迹；而 rAF 是每帧都跑的（实测 60fps）。
      window.__XL_FLIGHT__ = []
      var rec = function () {
        var qa = window.__XINGLV_QA__
        if (!qa) return
        var c = qa.camera()
        var xy = qa.starXY(pick.id)
        window.__XL_FLIGHT__.push({ phase: c.phase, r: c.r, y: c.y, th: c.theta, fov: c.fov, w: c.whoosh, sy: xy ? xy.y : null })
        if (window.__XL_FLIGHT__.length < 4000 && c.phase !== 'focused') requestAnimationFrame(rec)
      }
      requestAnimationFrame(rec)
      var t0 = performance.now()
      var seenPhase = {}
      for (var w = 0; w < 200; w++) {
        await wait(250)
        var cc = qa5.camera()
        seenPhase[cc.phase] = (seenPhase[cc.phase] ?? 0) + 1
        if (cc.phase === 'focused') break
      }
      var samples = window.__XL_FLIGHT__
      var wall = (performance.now() - t0) / 1000
      log('逐帧采样 ' + samples.length + ' 点（墙钟 ' + wall.toFixed(1) + 's），阶段：' + Object.keys(seenPhase).join(' → '))
      if (samples.length < 8) { log('采样仍太少，无法判断'); releaseDelay = 300; return }
      var fly = samples.filter(function (s) { return s.phase === 'fly' })
      var hold = samples.filter(function (s) { return s.phase === 'hold' })
      var settle = samples.filter(function (s) { return s.phase === 'settle' })
      log('各段帧数：hold ' + hold.length + ' / fly ' + fly.length + ' / settle ' + settle.length + '（60fps 下 1 帧≈17ms）')
      if (fly.length < 8) { log('飞行帧太少'); releaseDelay = 300; return }
      var maxY = Math.max.apply(null, fly.map(function (s) { return Math.abs(s.y) }))
      var minY = Math.min.apply(null, fly.map(function (s) { return Math.abs(s.y) }))
      var rs = fly.map(function (s) { return s.r })
      var ths = fly.map(function (s) { return s.th })
      var dth = 0
      for (var k = 1; k < ths.length; k++) { var d = ths[k] - ths[k - 1]; dth += Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) }
      log('高度 |y|：' + minY.toFixed(1) + ' ~ ' + maxY.toFixed(1) + '（掠过盘面应贴着小值）')
      log('半径 r：起 ' + rs[0].toFixed(1) + ' → 峰 ' + Math.max.apply(null, rs).toFixed(1) + ' → 终 ' + rs[rs.length - 1].toFixed(1))
      log('方位角总变化 ' + dth.toFixed(2) + ' rad（掠过 → 明显角向位移）')
      log('fov ' + Math.min.apply(null, fly.map(function (s) { return s.fov })).toFixed(1) + ' ~ ' + Math.max.apply(null, fly.map(function (s) { return s.fov })).toFixed(1))
      log('whoosh 峰值 ' + Math.max.apply(null, samples.map(function (s) { return s.w })).toFixed(2))
      var withXY = samples.filter(function (s) { return s.sy !== null })
      if (withXY.length > 2) log('目标星屏幕 y：首 ' + Math.round(withXY[0].sy) + ' → 末 ' + Math.round(withXY[withXY.length - 1].sy) + '（中心约 450）')
      // 抽 9 个点打一条轨迹，方便一眼看出路径形状
      var trace = []
      for (var q = 0; q < 9; q++) {
        var s2 = fly[Math.min(fly.length - 1, Math.round((q / 8) * (fly.length - 1)))]
        trace.push('r' + s2.r.toFixed(0) + 'y' + s2.y.toFixed(0))
      }
      log('轨迹(r/y)：' + trace.join(' → '))
      // 交互反馈是否真的接上了（着色器里早就写好，之前一直没人喂数据）
      qa5.hover(pick.id)
      await wait(400)
      var cuesHover = qa5.lifeStarCues()
      log('uHover 写入：' + JSON.stringify(cuesHover))
      var cuesSel = qa5.lifeStarCues()
      log('uSelected（点开的那颗星，不应是 -1）：' + JSON.stringify(cuesSel))
      qa5.hover(null)
      releaseDelay = 500
    } else if (scenario === 'measure') {
      await loadSample()
      await waitForCameraSettle(16000)
      var sel = ['.brand', '.topbar', '.statusline', '.dock', '.timerail', '.just-born', '.constellation-label']
      for (var mi = 0; mi < sel.length; mi++) {
        var el2 = q(sel[mi])
        if (!el2) {
          log(sel[mi] + ' = absent')
          continue
        }
        var rr = el2.getBoundingClientRect()
        log(sel[mi] + ' = ' + [rr.left, rr.top, rr.width, rr.height].map(Math.round).join(','))
      }
      log(
        'viewport=' + window.innerWidth + 'x' + window.innerHeight +
          ' scroll=' + document.documentElement.scrollWidth + 'x' + document.documentElement.scrollHeight +
          ' overflowX=' + (document.documentElement.scrollWidth > window.innerWidth)
      )
      releaseDelay = 300
    } else if (scenario === 'roundtrip') {
      await loadSample()
      await waitForCameraSettle(16000)
      var qa2 = window.__XINGLV_QA__
      var before = qa2.state()
      var json = qa2.exportText()
      var parsed = null
      try {
        parsed = JSON.parse(json)
      } catch (e) {
        log('export JSON parse FAILED: ' + e)
      }
      log(
        'export bytes=' + json.length + ' app=' + (parsed && parsed.app) +
          ' achievements=' + (parsed && parsed.achievements ? parsed.achievements.length : 'n/a')
      )
      var r1 = await qa2.importText(json, 'merge')
      log('merge import ok=' + r1.ok + ' count=' + r1.count + ' total=' + qa2.state().total)
      var r2 = await qa2.importText(json, 'replace')
      log('replace import ok=' + r2.ok + ' count=' + r2.count + ' total=' + qa2.state().total)
      var bad = await qa2.importText('{"app":"other"}', 'merge')
      log('reject foreign file ok=' + bad.ok + ' err=' + bad.error)
      log('before total=' + before.total + ' journeys=' + qa2.state().journeys)
      await releaseHold(700)
      return
    } else if (scenario === 'archive') {
      await loadSample()
      await waitForCameraSettle(16000)
      if (clickByText('档案')) {
        await wait(900)
        log('archive sheet open')
      }
      releaseDelay = 400
    } else if (scenario === 'help') {
      await loadSample()
      await waitForCameraSettle(16000)
      if (clickByText('怎么用')) {
        await wait(700)
        log('help open')
      }
      releaseDelay = 400
    } else if (scenario === 'entry') {
      var e2 = await waitFor('.entry', 8000)
      log('entry present=' + !!e2)
      releaseDelay = 500
    } else {
      log('unknown scenario')
    }
    log('done after ' + ((Date.now() - t0) / 1000).toFixed(1) + 's; panels=' + document.querySelectorAll('.panel').length)
    await releaseHold(releaseDelay)
  }

  window.addEventListener('error', function (e) {
    log('JS ERROR: ' + (e.message || 'unknown'))
  })
  window.addEventListener('unhandledrejection', function (e) {
    log('PROMISE REJECT: ' + ((e.reason && e.reason.message) || e.reason))
  })

  run().catch(function (err) {
    log('DRIVE FAIL: ' + (err && err.message ? err.message : String(err)))
  })
})()
