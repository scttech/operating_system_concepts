(function () {
  "use strict";
  const { h } = OSUI;
  const host = document.getElementById("faq"), q = document.getElementById("q");
  function render() {
    const needle = q.value.trim().toLowerCase();
    host.replaceChildren();
    let group = "", n = 0;
    OSData.faq.forEach((f) => {
      const plain = (f.q + " " + f.a.replace(/<[^>]+>/g, " ")).toLowerCase();
      if (needle && !plain.includes(needle)) return;
      n++;
      if (f.group !== group) { group = f.group; host.append(h("h2", { text: group })); }
      host.append(h("details", { class: "faq", open: !!needle }, h("summary", { text: f.q }), h("div", { html: f.a })));
    });
    if (!n) host.append(h("p", { text: "No matching questions." }));
  }
  q.addEventListener("input", render);
  render();
})();
