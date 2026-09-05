// OmniRoute WebReady - App JS
(function() {
  'use strict';

  var state = { apiKey: '', endpoint: '/v1', model: 'auto', messages: [], models: [] };

  try {
    var ep = localStorage.getItem('omniroute_endpoint');
    var ak = localStorage.getItem('omniroute_api_key');
    var m = localStorage.getItem('omniroute_model');
    if (ep) state.endpoint = ep;
    if (ak) state.apiKey = ak;
    if (m) state.model = m;
  } catch (e) {}

  function save() {
    try {
      localStorage.setItem('omniroute_endpoint', state.endpoint);
      localStorage.setItem('omniroute_api_key', state.apiKey);
      localStorage.setItem('omniroute_model', state.model);
    } catch (e) {}
  }

  function navigate(page) {
    document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    var nav = document.querySelector('.nav-item[data-page="' + page + '"]');
    if (nav) nav.classList.add('active');
    var pe = document.getElementById('page-' + page);
    if (pe) pe.classList.add('active');
    var titles = { dashboard: 'Dashboard', chat: 'Chat', models: 'Models', providers: 'Providers', apikeys: 'API Keys', usage: 'Usage', settings: 'Settings' };
    document.getElementById('pageTitle').textContent = titles[page] || page;
    if (page === 'models') loadModels();
    if (page === 'apikeys') loadApiKeys();
  }

  function addMessage(container, role, content) {
    var div = document.createElement('div');
    div.className = 'message ' + role;
    div.innerHTML = '<div class="role">' + role + '</div><div>' + content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  async function sendMessage(inputEl, containerEl, sendBtn) {
    var text = inputEl.value.trim();
    if (!text) return;
    addMessage(containerEl, 'user', text);
    inputEl.value = '';
    sendBtn.disabled = true;
    var msgs = state.messages.concat([{ role: 'user', content: text }]);
    try {
      var headers = { 'Content-Type': 'application/json' };
      if (state.apiKey && state.apiKey.length > 0) headers['Authorization'] = 'Bearer ' + state.apiKey;
      var resp = await fetch(state.endpoint + '/chat/completions', {
        method: 'POST', headers: headers,
        body: JSON.stringify({ model: state.model, messages: msgs, stream: false })
      });
      var data = await resp.json();
      if (data.choices && data.choices[0]) {
        addMessage(containerEl, 'assistant', data.choices[0].message.content);
        state.messages.push({ role: 'user', content: text });
        state.messages.push(data.choices[0].message);
      } else if (data.error) {
        addMessage(containerEl, 'assistant', 'Error: ' + data.error.message);
      }
    } catch (e) {
      addMessage(containerEl, 'assistant', 'Error: ' + e.message);
    }
    sendBtn.disabled = false;
  }

  async function loadModels() {
    try {
      var resp = await fetch(state.endpoint + '/models');
      if (resp.ok) {
        var data = await resp.json();
        state.models = data.data || [];
        var select = document.getElementById('chatModelSelect');
        if (select) {
          select.innerHTML = '<option value="auto">Auto</option>';
          state.models.forEach(function(m) {
            var opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.id + ' (' + m.owned_by + ')';
            select.appendChild(opt);
          });
        }
        var list = document.getElementById('modelsList');
        if (list) {
          list.innerHTML = state.models.map(function(m) {
            return '<div class="setting-row"><span>' + m.id + '</span><span class="badge">' + m.owned_by + '</span></div>';
          }).join('');
        }
        var statModels = document.getElementById('statModels');
        if (statModels) statModels.textContent = state.models.length;
      }
    } catch (e) {}
  }

  async function loadApiKeys() {
    var list = document.getElementById('apiKeysList');
    if (list) list.innerHTML = '<div class="key-row"><span class="key">sk-local-dev-key</span><span class="badge">Default</span></div>';
  }

  async function checkHealth() {
    try {
      var resp = await fetch('/health');
      if (resp.ok) {
        var data = await resp.json();
        document.getElementById('statusDot').classList.remove('offline');
        document.getElementById('statusText').textContent = 'Online (' + data.providers + ' providers)';
        document.getElementById('statProviders').textContent = data.providers;
      } else throw new Error('Not OK');
    } catch (e) {
      document.getElementById('statusDot').classList.add('offline');
      document.getElementById('statusText').textContent = 'Offline';
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    // Nav
    document.querySelectorAll('.nav-item').forEach(function(item) {
      item.addEventListener('click', function() { navigate(item.dataset.page); });
    });

    // Chat
    var chatSend = document.getElementById('chatSend');
    var chatInput = document.getElementById('chatInput');
    var dashSend = document.getElementById('dashSend');
    var dashInput = document.getElementById('dashInput');
    if (chatSend) chatSend.addEventListener('click', function() { sendMessage(chatInput, document.getElementById('chatMessages'), chatSend); });
    if (chatInput) chatInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') sendMessage(chatInput, document.getElementById('chatMessages'), chatSend); });
    if (dashSend) dashSend.addEventListener('click', function() { sendMessage(dashInput, document.getElementById('dashMessages'), dashSend); });
    if (dashInput) dashInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') sendMessage(dashInput, document.getElementById('dashMessages'), dashSend); });

    // Refresh
    var refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', function() { checkHealth(); loadModels(); });

    // New chat
    var newChatBtn = document.getElementById('newChatBtn');
    if (newChatBtn) newChatBtn.addEventListener('click', function() {
      state.messages = [];
      var el = document.getElementById('chatMessages');
      if (el) el.innerHTML = '';
      navigate('chat');
    });

    // Settings
    var setEp = document.getElementById('setEndpoint');
    var setAk = document.getElementById('setApiKey');
    var setM = document.getElementById('setModel');
    if (setEp) { setEp.value = state.endpoint; setEp.addEventListener('change', function(e) { state.endpoint = e.target.value; save(); }); }
    if (setAk) { setAk.value = state.apiKey; setAk.addEventListener('change', function(e) { state.apiKey = e.target.value; save(); }); }
    if (setM) { setM.value = state.model; setM.addEventListener('change', function(e) { state.model = e.target.value; save(); }); }

    // Model select
    var chatSel = document.getElementById('chatModelSelect');
    if (chatSel) chatSel.addEventListener('change', function(e) { state.model = e.target.value; save(); });

    // Add key
    var addKeyBtn = document.getElementById('addKeyBtn');
    if (addKeyBtn) addKeyBtn.addEventListener('click', function() {
      var key = prompt('Enter key name:');
      if (key) loadApiKeys();
    });

    // Init
    checkHealth();
    loadModels();
    setInterval(checkHealth, 30000);
  });
})();
