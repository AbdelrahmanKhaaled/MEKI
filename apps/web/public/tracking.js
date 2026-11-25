// Base pixels supplied in the MEKI tracking presentation. One installation per document.
(function (w, d) {
  if (w.mekiPagePixels) return;
  function load(src) {
    const script = d.createElement("script");
    script.async = true;
    script.src = src;
    d.head.appendChild(script);
  }

  if (!w.fbq) {
    const fbq = function () {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
      else fbq.queue.push(arguments);
    };
    fbq.queue = [];
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    w.fbq = w._fbq = fbq;
    load("https://connect.facebook.net/en_US/fbevents.js");
  }
  w.fbq("init", "2209802356282055");

  const id = "DC25E8RC77U703IGFBB0";
  w.TiktokAnalyticsObject = "ttq";
  const q = w.ttq = w.ttq || [];
  if (!q.load) {
    q.methods = "page track identify instances debug on off once ready alias group enableCookie disableCookie holdConsent revokeConsent grantConsent".split(" ");
    q.setAndDefer = (queue, method) => { queue[method] = (...args) => queue.push([method, ...args]); };
    q.methods.forEach((method) => q.setAndDefer(q, method));
    q.instance = (key) => {
      const instance = q._i[key] || [];
      q.methods.forEach((method) => q.setAndDefer(instance, method));
      return instance;
    };
    q.load = (key, options) => {
      const url = "https://analytics.tiktok.com/i18n/pixel/events.js";
      q._i = q._i || {};
      q._i[key] = [];
      q._i[key]._u = url;
      q._t = q._t || {};
      q._t[key] = Date.now();
      q._o = q._o || {};
      q._o[key] = options || {};
      load(url + "?sdkid=" + key + "&lib=ttq");
    };
  }
  q.load(id);
  let previous;
  w.mekiPagePixels = (path) => {
    if (path === previous) return;
    previous = path;
    w.fbq("track", "PageView");
    w.ttq.page();
  };
  w.mekiPagePixels(w.location.pathname);
})(window, document);
