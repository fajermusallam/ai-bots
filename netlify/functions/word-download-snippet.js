/* ═══════════════════════════════════════════════════════════
   أضيفي هذا الكود في كل HTML يستخدم chat.js أو sawt.js
   ضعيه داخل <script> بعد دالة sendMessage / sendMsg
   ═══════════════════════════════════════════════════════════ */

// ── استقبال ملف Word وتحميله ──────────────────────────
function handleWordDownload(wordFile, wordFileName) {
  if (!wordFile || !wordFileName) return;

  // فك تشفير base64 وإنشاء blob
  const byteChars   = atob(wordFile);
  const byteNumbers = new Array(byteChars.length).fill(0).map((_, i) => byteChars.charCodeAt(i));
  const byteArray   = new Uint8Array(byteNumbers);
  const blob        = new Blob([byteArray], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  // إنشاء رابط تحميل تلقائي
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = wordFileName;
  link.click();
  URL.revokeObjectURL(url);

  // إضافة فقاعة تنبيه في المحادثة
  addWordBubble(wordFileName);
}

function addWordBubble(fileName) {
  const area   = document.getElementById('chatArea') || document.getElementById('messages');
  if (!area) return;

  const div  = document.createElement('div');
  div.className = 'bubble sawt word-bubble'; // أو msg msg-bot حسب الملف
  div.style.cssText = `
    background: linear-gradient(135deg, rgba(0,100,200,0.15), rgba(0,100,200,0.05));
    border: 1px solid rgba(0,100,200,0.3);
    padding: 12px 16px; border-radius: 14px; margin: 8px 0;
    display: flex; align-items: center; gap: 10px;
    max-width: 80%; align-self: flex-end;
  `;
  div.innerHTML = `
    <span style="font-size:28px;">📄</span>
    <div>
      <div style="font-size:13px; font-weight:700; color:#4a90d9;">تم إنشاء الملف</div>
      <div style="font-size:11px; color:rgba(200,210,255,0.6); margin-top:2px;">${fileName}</div>
      <div style="font-size:11px; color:rgba(200,210,255,0.5);">✅ يُحمَّل تلقائياً على جهازك</div>
    </div>
  `;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════
   في دالة الإرسال الخاصة بك — أضيفي هذا السطرين بعد استقبال الرد:
   ═══════════════════════════════════════════════════════════

   // للملفات التي تستخدم chat.js (fajer-bots):
   if (data.wordFile) handleWordDownload(data.wordFile, data.wordFileName);

   // للملفات التي تستخدم sawt.js:
   if (data.wordFile) handleWordDownload(data.wordFile, data.wordFileName);

   ─────────────────────────────────────────────────────────
   مثال كامل في دالة sendMessage لـ muthab.html:

   const data = await res.json();
   hideTyping();
   if (data.reply) {
     addMsg('assistant', data.reply, getQuickReplies(data.reply));
     if (data.wordFile) handleWordDownload(data.wordFile, data.wordFileName); // ← أضيفي
   }

   ─────────────────────────────────────────────────────────
   مثال كامل في callSawt لـ sawt.html:

   const data = await res.json();
   const reply = data.content?.[0]?.text || '...';
   showTyping(false);
   conversationHistory.push({ role:'assistant', content:reply });
   addBubble(reply, 'sawt');
   speakSawt(reply);
   if (data.wordFile) handleWordDownload(data.wordFile, data.wordFileName); // ← أضيفي
   saveMemory();

   ═══════════════════════════════════════════════════════════
   الكلمات التي تُفعّل إنشاء الملف تلقائياً:
   ملف | وورد | word | تقرير | وثيقة | مستند | احفظ |
   تلخيص مكتوب | خطة مكتوبة | دليل | نموذج | قالب | كتيب
   ═══════════════════════════════════════════════════════════ */
