// The rail (Host bar, item 3). Plain DOM glue on purpose: it renders the
// state main pushes over window.dshDesktop and sends back user intents.
// All page state of a Host lives in its own view, not here.
"use strict";

const state = { hosts: [] };

const hostsEl = document.getElementById("hosts");
const addEl = document.getElementById("add");
const formEl = document.getElementById("port-entry");
const inputEl = document.getElementById("port-input");

function initials(label) {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const letters = words.map((word) => word[0]).join("");
  return (letters || "?").slice(0, 2).toUpperCase();
}

function render() {
  hostsEl.textContent = "";
  for (const host of state.hosts) {
    const button = document.createElement("button");
    button.className = "host " + host.status + (host.active ? " active" : "");
    button.title = host.label + " · 127.0.0.1:" + host.port + " · " + host.status;
    const disc = document.createElement("span");
    disc.textContent = initials(host.label);
    const dot = document.createElement("span");
    dot.className = "dot";
    button.append(disc, dot);
    button.addEventListener("click", function () {
      window.dshDesktop.selectHost(host.id);
    });
    hostsEl.append(button);
  }
}

addEl.addEventListener("click", function (event) {
  const rect = event.currentTarget.getBoundingClientRect();
  window.dshDesktop.plusMenu({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
});

window.dshDesktop.onBeginPortEntry(function () {
  formEl.hidden = false;
  inputEl.value = "";
  inputEl.focus();
});

formEl.addEventListener("submit", function (event) {
  event.preventDefault();
  const value = inputEl.value.trim();
  if (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535) {
    formEl.hidden = true;
    window.dshDesktop.addHostAtPort(value);
    return;
  }
  inputEl.classList.add("invalid");
  setTimeout(function () {
    inputEl.classList.remove("invalid");
  }, 600);
});

inputEl.addEventListener("keydown", function (event) {
  if (event.key === "Escape") formEl.hidden = true;
});

window.dshDesktop.onHostsChanged(function (next) {
  state.hosts = next.hosts;
  render();
});

window.dshDesktop.getState().then(function (next) {
  state.hosts = next.hosts;
  render();
});
