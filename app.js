// ============================================================
//  app.js — Ayritech Business Solutions AI Assistant
//  Depends on: config.js (loaded first in index.html)
//  Uses globals: GROQ_API_KEY, firebaseConfig
// ============================================================

// ── Firebase Init (uses firebaseConfig from config.js) ───────
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ── Company Knowledge Base ───────────────────────────────────
const COMPANY_DATA = `
Ayritech Business Solutions is a technology company.

Services:
- Website Development
- UI/UX Design
- Mobile App Development
- SEO Services
- Digital Marketing
- Software Solutions
- Business Consulting

Technologies:
HTML, CSS, JavaScript, React, Firebase, Node.js, Flutter

Business Goals:
Help businesses grow online.
Provide modern digital solutions.
Deliver professional software services.

Target Clients:
Startups, Businesses, Local companies, Entrepreneurs

Communication Style:
Professional, Short responses, Helpful, Friendly
`;

const FAQS = [
  { question: "Do you create websites?",         answer: "Yes, Ayritech develops responsive and modern business websites." },
  { question: "Do you provide SEO services?",    answer: "Yes, Ayritech provides complete SEO solutions including keyword research and technical SEO." },
  { question: "Do you build mobile apps?",       answer: "Yes, Ayritech develops Android and cross-platform mobile applications." },
  { question: "Which technologies do you use?",  answer: "We use HTML, CSS, JavaScript, React, Firebase, Node.js, and Flutter." }
];

// ── System Prompt (uses COMPANY_DATA above) ───────────────────
const SYSTEM_PROMPT = `
You are Ayritech Business Solutions AI Assistant.

Use the company information below to answer users professionally.

COMPANY INFORMATION:
${COMPANY_DATA}

Rules:
1. Answer only related to Ayritech services.
2. Recommend Ayritech services naturally.
3. Keep replies under 120 words.
4. Be professional and modern.
5. If user asks unrelated things, politely redirect to company services.
6. Suggest consultation for custom projects.

Always use:
[CATEGORY: Service Name]
`;

// ── App State ─────────────────────────────────────────────────
const MAX_HISTORY      = 20;
let   conversationHistory = [];
let   isTyping            = false;
let   currentUser         = null;

// ── Firebase Auth Listener ────────────────────────────────────
auth.onAuthStateChanged(user => {
  currentUser = user;
  const authOverlay  = document.getElementById('authOverlay');
  const nameLabel    = document.getElementById('userNameDisplay');
  const messagesDiv  = document.getElementById('messages');

  if (user) {
    if (authOverlay) authOverlay.classList.remove('visible');
    if (nameLabel)   nameLabel.textContent = user.email.split('@')[0];

    // Show greeting only when chat is empty
    if (messagesDiv && messagesDiv.children.length === 0) {
      setTimeout(() => {
        const userName = user.email.split('@')[0];
        appendBotMessage(`Welcome back, ${userName}! 👋 I'm your Ayritech AI assistant. How can I help you today?`, 'General');
      }, 500);
    }
  } else {
    if (authOverlay) authOverlay.classList.add('visible');
    if (messagesDiv) messagesDiv.innerHTML = '';
    conversationHistory = [];
  }
});

// ── Auth Handlers ─────────────────────────────────────────────
async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const errEl = document.getElementById('authError');

  if (!email || !pass) { errEl.textContent = "Please fill in all fields."; return; }

  try {
    errEl.textContent = "Logging in...";
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (error) {
    console.error(error);
    errEl.textContent = error.message;
  }
}

async function handleSignup() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const errEl = document.getElementById('authError');

  if (!email || !pass)    { errEl.textContent = "Please fill in all fields."; return; }
  if (pass.length < 6)    { errEl.textContent = "Password must be at least 6 characters."; return; }

  try {
    errEl.textContent = "Creating account...";
    await auth.createUserWithEmailAndPassword(email, pass);
    alert("Success! Your account is ready.");
  } catch (error) {
    console.error(error);
    errEl.textContent = error.message;
  }
}

// ── Main Send Flow ────────────────────────────────────────────
async function sendMessage() {
  if (!currentUser) {
    document.getElementById('authOverlay').classList.add('visible');
    return;
  }

  const input = document.getElementById('userInput');
  const text  = input.value.trim();
  if (!text || isTyping) return;

  input.value = '';
  autoResize(input);
  hideQuickReplies();
  appendUserMessage(text);
  conversationHistory.push({ role: 'user', content: text });

  // ── Smart FAQ shortcuts (no API call needed) ──────────────
  const lowerText = text.toLowerCase();

  if (lowerText.includes("price") || lowerText.includes("cost") || lowerText.includes("website cost")) {
    appendBotMessage(
      "Website pricing depends on features, pages, and design requirements. Ayritech provides affordable custom website solutions for businesses and startups. We recommend a consultation for exact pricing.",
      "Website Development"
    );
    return;
  }

  if (lowerText.includes("seo")) {
    appendBotMessage(
      "Ayritech provides SEO services to improve Google rankings, traffic, and online visibility for businesses.",
      "SEO Services"
    );
    return;
  }

  if (lowerText.includes("mobile app")) {
    appendBotMessage(
      "Ayritech develops modern mobile applications for Android and businesses using technologies like Flutter.",
      "Mobile App Development"
    );
    return;
  }
  // ── End shortcuts ─────────────────────────────────────────

  // Cap history size
  if (conversationHistory.length > MAX_HISTORY) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY);
  }

  showTyping();

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`   // ← key comes from config.js
      },
      body: JSON.stringify({
        model:       "llama-3.1-8b-instant",
        messages:    [{ role: "system", content: SYSTEM_PROMPT }, ...conversationHistory],
        temperature: 0.7
      })
    });

    const data = await response.json();
    hideTyping();

    if (data.choices && data.choices[0]) {
      const rawText       = data.choices[0].message.content;
      const categoryMatch = rawText.match(/\[CATEGORY:\s*([^\]]+)\]/i);
      const category      = categoryMatch ? categoryMatch[1].trim() : "General";
      const cleanText     = rawText.replace(/\[CATEGORY:[^\]]+\]/gi, '').trim();

      conversationHistory.push({ role: 'assistant', content: rawText });
      appendBotMessage(cleanText, category);

      if (/recommend.*human agent|escalat/i.test(cleanText)) {
        setTimeout(() => showEscalate(), 1200);
      }
    } else {
      throw new Error("Invalid response format");
    }

  } catch (err) {
    console.error("API Error:", err);
    hideTyping();
    appendBotMessage(
      "I'm experiencing connection issues. Please try again in a moment, or use the escalate button to reach a human agent.",
      'Technical Support'
    );
  }
}

// ── Message Rendering ─────────────────────────────────────────
function appendBotMessage(text, category) {
  const msgs = document.getElementById('messages');
  const time = formatTime();

  const group = document.createElement('div');
  group.className = 'msg-group';

  const row = document.createElement('div');
  row.className = 'msg-row bot';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar bot-avatar';
  avatar.style.cssText = 'width:30px;height:30px;border-radius:50%;font-size:13px;display:flex;align-items:center;justify-content:center;';
  avatar.textContent = '🤖';

  const bubble = document.createElement('div');
  bubble.className = 'bubble bot-bubble';

  if (category) {
    const tag = document.createElement('div');
    tag.className = 'category-tag';
    tag.textContent = `◈ ${category}`;
    bubble.appendChild(tag);
  }

  // Safe multi-line text rendering
  text.split('\n').forEach((line, i, arr) => {
    bubble.appendChild(document.createTextNode(line));
    if (i < arr.length - 1) bubble.appendChild(document.createElement('br'));
  });

  row.appendChild(avatar);
  row.appendChild(bubble);

  const timeEl = document.createElement('div');
  timeEl.className = 'msg-time';
  timeEl.style.paddingLeft = '42px';
  timeEl.textContent = `Ayritech AI · ${time}`;

  group.appendChild(row);
  group.appendChild(timeEl);
  msgs.appendChild(group);
  saveHistory(text, 'AI');
  scrollToBottom();
}

function appendUserMessage(text) {
  const msgs = document.getElementById('messages');
  const time = formatTime();

  const group = document.createElement('div');
  group.className = 'msg-group';

  const row = document.createElement('div');
  row.className = 'msg-row user';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar user-avatar';
  avatar.style.cssText = 'width:30px;height:30px;border-radius:50%;font-size:13px;display:flex;align-items:center;justify-content:center;';
  avatar.textContent = '🧑';

  const bubble = document.createElement('div');
  bubble.className = 'bubble user-bubble';

  text.split('\n').forEach((line, i, arr) => {
    bubble.appendChild(document.createTextNode(line));
    if (i < arr.length - 1) bubble.appendChild(document.createElement('br'));
  });

  row.appendChild(avatar);
  row.appendChild(bubble);

  const timeEl = document.createElement('div');
  timeEl.className = 'msg-time';
  timeEl.textContent = `You · ${time}`;
  timeEl.style.textAlign = 'right';

  group.appendChild(row);
  group.appendChild(timeEl);
  msgs.appendChild(group);

  // Persist to Firestore
  if (currentUser) {
    db.collection("chats").add({
      uid:       currentUser.uid,
      text,
      sender:    'user',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  saveHistory(text, 'You');
  scrollToBottom();
}

// ── UI Helpers ────────────────────────────────────────────────
function showTyping() {
  isTyping = true;
  document.getElementById('sendBtn').disabled = true;
  document.getElementById('typingIndicator').classList.remove('hidden');
  scrollToBottom();
}

function hideTyping() {
  isTyping = false;
  document.getElementById('sendBtn').disabled = false;
  document.getElementById('typingIndicator').classList.add('hidden');
}

function hideQuickReplies() {
  document.getElementById('quickReplies').style.display = 'none';
}

function scrollToBottom() {
  const msgs = document.getElementById('messages');
  setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 50);
}

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function quickSend(text) {
  document.getElementById('userInput').value = text;
  sendMessage();
}

function sendTopic(e, topic) {
  document.querySelectorAll('.topic-item').forEach(t => t.classList.remove('active'));
  e.currentTarget.classList.add('active');
  quickSend(`I need help with ${topic}`);
}

function clearChat() {
  document.getElementById('messages').innerHTML = '';
  conversationHistory = [];
  document.getElementById('quickReplies').style.display = 'flex';
  const greeting = currentUser
    ? `Chat cleared. Hello ${currentUser.email.split('@')[0]}! How can I help you?`
    : "Chat cleared. How can I help you?";
  appendBotMessage(greeting, 'General');
}

// ── Modals ────────────────────────────────────────────────────
function showEscalate() { document.getElementById('escalateModal').classList.add('visible'); }
function showRating()   { document.getElementById('ratingModal').classList.add('visible'); }

function closeModal() {
  document.querySelectorAll('.modal-overlay:not(#authOverlay)').forEach(m => m.classList.remove('visible'));
}

function escalateToHuman() {
  closeModal();
  appendBotMessage(
    "✅ You've been connected to a human agent queue. A support specialist will join this chat shortly. Your conversation history has been shared with them.",
    'Escalation'
  );
}

function submitRating(emoji, label) {
  closeModal();
  appendBotMessage(
    `Thank you for your ${label} rating ${emoji}! Your feedback helps us improve our support quality. Is there anything else I can help you with?`,
    'Feedback'
  );
}

// Close modals when clicking outside
document.querySelectorAll('.modal-overlay:not(#authOverlay)').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
});

// ── Chat History (localStorage) ───────────────────────────────
function saveHistory(message, sender) {
  let history = JSON.parse(localStorage.getItem('ayritechHistory')) || [];
  history.unshift({ sender, message, time: new Date().toLocaleString() });
  localStorage.setItem('ayritechHistory', JSON.stringify(history.slice(0, 50)));
}

function toggleHistory() {
  const panel = document.getElementById('historyPanel');
  if (panel.style.display === 'block') { panel.style.display = 'none'; }
  else { loadHistory(); panel.style.display = 'block'; }
}

function closeHistory() {
  document.getElementById('historyPanel').style.display = 'none';
}

function loadHistory() {
  const historyContent = document.getElementById('historyContent');
  const history = JSON.parse(localStorage.getItem('ayritechHistory')) || [];

  historyContent.innerHTML = '';

  if (history.length === 0) {
    historyContent.innerHTML = '<div style="color:#777;font-size:13px;">No chat history available.</div>';
    return;
  }

  history.forEach(chat => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const sender = document.createElement('div');
    sender.className = 'history-item-sender';
    sender.textContent = chat.sender;

    const msg = document.createElement('div');
    msg.className = 'history-item-text';
    msg.textContent = chat.message;   // textContent — no XSS risk

    const t = document.createElement('div');
    t.className = 'history-item-time';
    t.textContent = chat.time;

    item.appendChild(sender);
    item.appendChild(msg);
    item.appendChild(t);
    historyContent.appendChild(item);
  });
}

function clearHistory() {
  localStorage.removeItem('ayritechHistory');
  loadHistory();
}
