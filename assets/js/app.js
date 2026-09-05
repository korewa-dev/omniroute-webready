// OmniRoute WebReady - App JS

var state = {
  apiKey: '',
  endpoint: '/v1',
  model: 'auto',
  messages: [],
  providers: []
};

document.querySelectorAll('.nav-item').forEach(function (item) {
  item.addEventListener('click', function () {
    var page = item.dataset.page;
    document.querySelectorAll('.nav-item').forEach(function (i) { i.classList.remove('active'); });
    item.classList.add('active');
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    var pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');
    var titles = { dashboard: 'Dashboard', chat: 'Chat', providers: 'Providers', settings: 'Settings' };
    document.getElementById('pageTitle').textContent = titles[page] || page;
    if (page === 'providers') loadProviders();
    if (page === 'chat') loadModels();
  });
});

async function loadModels() {
  try {
    var resp = await fetch(state.endpoint + '/models');
    if (resp.ok) {
      var data = await resp.json();
      state.providers = data.data || [];
      var select = document.getElementById('modelSelect');
      select.innerHTML = '<option value="auto">auto</option>';
      state.providers.forEach(function (m) {
        var opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.id + ' (' + m.owned_by + ')';
        select.appendChild(opt);
      });
    }
  } catch (e) {
    console.error('Failed to load models:', e);
  }
}

async function loadProviders() {
  try {
    var resp = await fetch(state.endpoint + '/models');
    if (resp.ok) {
      var data = await resp.json();
      var providers = {};
      (data.data || []).forEach(function (m) {
        if (!providers[m.owned_by]) {
          providers[m.owned_by] = { id: m.owned_by, models: [] };
        }
        providers[m.owned_by].models.push(m.id);
      });
      var list = document.getElementById('providerList');
      list.innerHTML = Object.values(providers).map(function (p) {
        return '<div class="provider-item"><div class="provider-info"><h4>' + p.id + '</h4><p>' + p.models.length + ' models: ' + p.models.slice(0, 3).join(', ') + (p.models.length > 3 ? '...' : '') + '</p></div><div class="provider-status"><span class="badge badge-success">Active</span></div></div>';
      }).join('');
      document.getElementById('providerCount').textContent = Object.keys(providers).length;
    }
  } catch (e) {
    console.error('Failed to load providers:', e);
  }
}

async function checkHealth() {
  try {
    var resp = await fetch('/health');
    if (resp.ok) {
      var data = await resp.json();
      document.getElementById('statusDot').classList.remove('offline');
      document.getElementById('statusText').textContent = 'Online (' + data.providers + ' providers)';
      document.getElementById('providerCount').textContent = data.providers;
    } else {
      throw new Error('Not OK');
    }
  } catch (e) {
    document.getElementById('statusDot').classList.add('offline');
    document.getElementById('statusText').textContent = 'Offline';
  }
}

async function sendMessage(inputEl, messagesEl, sendBtn) {
  var text = inputEl.value.trim();
  if (!text) return;
  addMessage(messagesEl, 'user', text);
  inputEl.value = '';
  sendBtn.disabled = true;
  var msgs = state.messages.concat([{ role: 'user', content: text }]);
  try {
    var headers = { 'Content-Type': 'application/json' };
    if (state.apiKey && state.apiKey.length > 0) headers['Authorization'] = 'Bearer ' + state.apiKey;
    var resp = await fetch(state.endpoint + '/chat/completions', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ model: state.model, messages: msgs, stream: false })
    });
    var data = await resp.json();
    if (data.choices && data.choices[0]) {
      addMessage(messagesEl, 'assistant', data.choices[0].message.content);
      state.messages.push({ role: 'user', content: text });
      state.messages.push(data.choices[0].message);
    } else if (data.error) {
      addMessage(messagesEl, 'assistant', 'Error: ' + data.error.message);
    }
  } catch (e) {
    addMessage(messagesEl, 'assistant', 'Error: ' + e.message);
  }
  sendBtn.disabled = false;
}

function addMessage(container, role, content) {
  var msg = document.createElement('div');
  msg.className = 'message ' + role;
  msg.innerHTML = '<div class="role">' + role + '</div><div>' + content.replace(/\n/g, '<br>') + '</div>';
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

document.getElementById('chatSend').addEventListener('click', function () {
  sendMessage(document.getElementById('chatInput'), document.getElementById('chatMessages'), document.getElementById('chatSend'));
});

document.getElementById('chatInput').addEventListener('keypress', function (e) {
  if (e.key === 'Enter') sendMessage(document.getElementById('chatInput'), document.getElementById('chatMessages'), document.getElementById('chatSend'));
});

document.getElementById('dashSend').addEventListener('click', function () {
  sendMessage(document.getElementById('dashInput'), document.getElementById('dashMessages'), document.getElementById('dashSend'));
});

document.getElementById('dashInput').addEventListener('keypress', function (e) {
  if (e.key === 'Enter') sendMessage(document.getElementById('dashInput'), document.getElementById('dashMessages'), document.getElementById('dashSend'));
});

document.getElementById('apiEndpoint').addEventListener('change', function (e) {
  state.endpoint = e.target.value;
});

document.getElementById('apiKey').addEventListener('change', function (e) {
  state.apiKey = e.target.value;
});

document.getElementById('defaultModel').addEventListener('change', function (e) {
  state.model = e.target.value;
});

document.getElementById('refreshBtn').addEventListener('click', function () {
  checkHealth();
  loadProviders();
  loadModels();
});

checkHealth();
loadProviders();
loadModels();
setInterval(checkHealth, 30000);
