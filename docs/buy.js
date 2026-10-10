// Essay 이용권 구매 페이지 (docs/buy.html). 서버: server/src/billing.ts
(function () {
  // 다른 사이트 안에 숨겨 띄우는 것 막기 (클릭재킹)
  if (window.top !== window.self) { window.top.location = window.self.location.href; return; }
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var API = local ? 'http://localhost:8787' : 'https://api.essay.win';
  var q = new URLSearchParams(location.search);
  var ref = /^[0-9a-f]{32}$/.test(q.get('ref') || '') ? q.get('ref') : '';
  try { if (ref) sessionStorage.setItem('essay-ref', ref); else ref = sessionStorage.getItem('essay-ref') || ''; } catch (e) {}
  var returnedId = q.get('paymentId'), returnedCode = q.get('code'), returnedMsg = q.get('message');
  // 주소창 · 방문 기록에 결제 번호 · ref 가 남지 않게 지운다
  if (location.search) history.replaceState(null, '', location.pathname);
  var $ = function (id) { return document.getElementById(id); };
  var won = function (n) { return Number(n).toLocaleString('ko-KR') + '원'; };
  function post(path, body) {
    return fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); });
  }
  var buttons = [].slice.call(document.querySelectorAll('button.pay'));
  var setBusy = function (on) { buttons.forEach(function (b) { b.disabled = on; }); };
  function error(msg) { $('err').textContent = msg; $('err').hidden = false; setBusy(false); }
  function finish(paymentId) {
    return post('/v1/billing/complete', { paymentId: paymentId }).then(function (r) {
      if (!r.j.ok) return error(r.j.error || '결제를 확인하지 못했어요');
      $('buy').hidden = true; $('done').hidden = false; $('key').textContent = r.j.key;
      if (!ref) $('done-app').textContent = 'Essay의 결제 화면에서 [이용권 키가 있어요]를 누르고 아래 키를 넣어 주세요.';
    });
  }
  // 가격과 쓸 수 있는 결제 수단은 서버가 정한 대로 보여 준다
  post('/v1/billing/options', {}).then(function (r) {
    var o = r.j || {};
    if (o.price) { $('price').textContent = won(o.price); $('list').textContent = won(o.listPrice); $('list').hidden = !(o.listPrice > o.price); }
    (o.methods || []).forEach(function (m) { var b = document.querySelector('button.pay[data-method="' + m + '"]'); if (b) b.hidden = false; });
    $('soon').hidden = !!(o.methods && o.methods.length);
  }).catch(function () { $('soon').hidden = false; });
  var chosen = 'kakaopay';
  buttons.forEach(function (b) { b.addEventListener('click', function () { chosen = b.getAttribute('data-method'); }); });
  $('copy').addEventListener('click', function () {
    navigator.clipboard.writeText($('key').textContent).then(function () { $('copy').textContent = '복사됨'; });
  });
  // 모바일 결제는 이 페이지로 되돌아온다 (?paymentId=…)
  if (returnedId) {
    if (returnedCode) error(returnedMsg || '결제가 끝나지 않았어요');
    else finish(returnedId);
  }
  $('buy').addEventListener('submit', function (e) {
    e.preventDefault();
    $('err').hidden = true; setBusy(true);
    post('/v1/billing/prepare', { method: chosen, ref: ref, email: $('email').value.trim() }).then(function (r) {
      if (!r.j.ok) return error(r.j.error || '결제를 시작하지 못했어요');
      var o = r.j;
      $('price').textContent = won(o.amount);
      // 로컬 시험(가짜 결제)은 결제 창 없이 바로 확인
      if (o.paymentId.indexOf('mock-') === 0) return finish(o.paymentId);
      return PortOne.requestPayment({
        storeId: o.storeId, channelKey: o.channelKey, paymentId: o.paymentId, orderName: o.orderName,
        totalAmount: o.amount, currency: 'CURRENCY_KRW', payMethod: o.payMethod || 'EASY_PAY', bypass: o.bypass,
        customer: $('email').value.trim() ? { email: $('email').value.trim() } : undefined,
        redirectUrl: location.origin + location.pathname
      }).then(function (res) {
        if (!res || res.code !== undefined) return error((res && res.message) || '결제가 끝나지 않았어요');
        return finish(o.paymentId);
      });
    }).catch(function () { error('서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.'); });
  });
})();
