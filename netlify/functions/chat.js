const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL   || 'https://keen-ant-82868.upstash.io';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAAAUO0AAIncDFjMGE3Y2MzODU3NzM0YTI0ODI0OTg3M2ZhZDA5ZTUwOHAxODI4Njg';

async function redisGet(key) {
  const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
  const d = await r.json();
  return d.result ? JSON.parse(d.result) : null;
}
async function redisSet(key, val) {
  await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(val))}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
}
async function redisIncr(key) {
  const r = await fetch(`${UPSTASH_URL}/incr/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
  return (await r.json()).result;
}
async function redisExpire(key, ttl) {
  await fetch(`${UPSTASH_URL}/expire/${encodeURIComponent(key)}/${ttl}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
}

async function checkRateLimit(code) {
  const key = `rate:${code}:${Math.floor(Date.now() / 3600000)}`;
  const count = await redisIncr(key);
  if (count === 1) await redisExpire(key, 3600);
  return count <= 50;
}

async function validateCode(code, isVerifyOnly = false) {
  const DEMO = ['FJ-TEST-2026','FJ-DEMO-0001','MT-TEST-2026','SW-TEST-2026','SW-DEMO-2026','SW-TEST-0001','SW-0001-SAWT'];
  if (DEMO.includes(code)) return { valid: true, remaining: 99 };
  const prefix = code.startsWith('SW-') ? 'sw' : code.startsWith('MT-') ? 'mt' : 'fj';
  const data = await redisGet(`${prefix}:${code}`);
  if (!data) return { valid: false, error: 'الكود غير صحيح أو غير موجود' };
  if (data.remaining <= 0) return { valid: false, error: 'انتهت رسائل هذا الكود' };
  if (!isVerifyOnly) { data.remaining -= 1; data.used = true; await redisSet(`${prefix}:${code}`, data); }
  return { valid: true, remaining: data.remaining };
}

function needsFile(message) {
  const triggers = ['ملف','وورد','word','تقرير','وثيقة','مستند','احفظ',
                    'اعطني ملف','أرسل ملف','pdf','تلخيص مكتوب',
                    'خطة مكتوبة','دليل','نموذج','قالب','كتيب','برنامج'];
  return triggers.some(t => message.toLowerCase().includes(t));
}

async function generateFileContent(message, botPrompt) {
  const system = `أنت خبير في كتابة الوثائق والمستندات الاحترافية بالعربية.
تخصصك: ${botPrompt.split('\n')[0]}
المهمة: أنشئ وثيقة احترافية كاملة ومنسقة للطلب التالي.
قواعد التنسيق الإلزامية:
- ابدأ بعنوان رئيسي (#)
- قسّم بعناوين فرعية (##) و (###)
- استخدم قوائم (-) للخطوات والنقاط
- **تمييز** للمصطلحات المهمة
- الوثيقة منظمة ومتدرجة — ليست محادثة
- لا تكتب "بالطبع!" أو "سأساعدك" أو أي مقدمة محادثة
- ابدأ مباشرة بمحتوى الوثيقة
- الحد الأدنى: 700 كلمة
- أضف خاتمة وملاحظات ختامية`;
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2500,
    system,
    messages: [{ role: 'user', content: message }]
  });
  return response.content[0]?.text || '';
}

function generateHTMLFile(title, content, botName, botEmoji) {
  try {
    const htmlContent = content
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '</p><h3>$1</h3><p>')
      .replace(/^## (.+)$/gm,  '</p><h2>$1</h2><p>')
      .replace(/^# (.+)$/gm,   '</p><h1>$1</h1><p>')
      .replace(/^[-•◈]\s*(.+)$/gm, '</p><li>$1</li><p>')
      .replace(/^[١٢٣٤٥٦٧٨٩\d]+[\.\-\)]\s*(.+)$/gm, '</p><li>$1</li><p>')
      .replace(/\n\n+/g, '</p><p>')
      .replace(/\n/g, '<br>');
    return Buffer.from(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Tajawal',Arial,sans-serif;direction:rtl;background:#f5f5fa;color:#1a1a2e;line-height:1.95;font-size:16px}
.page{max-width:820px;margin:0 auto;background:white;min-height:100vh;padding:60px 70px;box-shadow:0 0 40px rgba(0,0,0,.08)}
.header{text-align:center;padding:32px 24px;background:linear-gradient(135deg,#f0eeff,#e8f4ff);border-radius:16px;margin-bottom:40px;border:1px solid #d8d0ff}
.emoji{font-size:52px;display:block;margin-bottom:14px}
.main-title{font-family:'Amiri',serif;font-size:30px;font-weight:700;color:#1a1a2e;margin-bottom:8px}
.meta{font-size:13px;color:#888}.meta b{color:#7c3aed}
.divider{height:3px;background:linear-gradient(90deg,#7c3aed,#00c9a7,#7c3aed);border-radius:2px;margin:32px 0}
.content p{margin-bottom:14px;text-align:justify}
.content h1{font-family:'Amiri',serif;font-size:26px;color:#2c3e7a;margin:32px 0 14px;padding-right:14px;border-right:4px solid #2c3e7a}
.content h2{font-size:20px;color:#7c3aed;margin:26px 0 12px;padding-right:12px;border-right:3px solid #7c3aed}
.content h3{font-size:17px;color:#059669;margin:20px 0 10px;font-weight:700}
.content li{margin:0 20px 8px;list-style:none;padding-right:20px;position:relative}
.content li::before{content:'◈';position:absolute;right:0;color:#7c3aed;font-size:13px}
.content strong{color:#2c3e7a;font-weight:700}
.content em{color:#059669;font-style:normal;font-weight:700}
.footer{margin-top:60px;padding-top:20px;border-top:2px solid #f0eeff;text-align:center;font-size:12px;color:#aaa}
.footer b{color:#7c3aed}
.print-btn{position:fixed;bottom:24px;left:24px;padding:12px 22px;background:linear-gradient(135deg,#7c3aed,#2c3e7a);color:white;border:none;border-radius:28px;cursor:pointer;font-family:'Tajawal',sans-serif;font-size:15px;font-weight:700;box-shadow:0 4px 20px rgba(124,58,237,.4);z-index:100;transition:all .2s}
.print-btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(124,58,237,.5)}
@media print{body{background:white}.page{box-shadow:none;padding:20px 40px}.print-btn{display:none}.header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
@media(max-width:600px){.page{padding:24px 18px}.main-title{font-size:22px}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <span class="emoji">${botEmoji}</span>
    <div class="main-title">${title}</div>
    <div class="meta">بوت <b>${botName}</b> | مشروع الجماد الحي — فجر عبدالرحمن المسلم</div>
  </div>
  <div class="divider"></div>
  <div class="content"><p>${htmlContent}</p></div>
  <div class="footer">
    <b>© حقوق محفوظة لـ فجر عبدالرحمن المسلم — مؤسسة مشروع الجماد الحي</b><br>
    استناداً لقانون حقوق المؤلف الكويتي رقم 64/1999 واتفاقية برن الدولية
  </div>
</div>
<button class="print-btn" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
</body>
</html>`, 'utf-8').toString('base64');
  } catch(e) {
    console.error('HTML generation error:', e.message);
    return null;
  }
}

const PROMPTS = {
noor:`أنتِ نور 🌟 — رفيقة الصحة النفسية في مشروع الجماد الحي.
منهجيتك: CBT (Aaron Beck) | ACT (Steven Hayes) | DBT (Marsha Linehan) | Positive Psychology (Seligman) | MBCT
مراجعك: APA (DSM-5) | WHO Mental Health | Kuwait Mental Health Society | Arab Journal of Psychiatry
أسلوبك: استمعي أولاً، أكدي المشاعر، قدمي تحليلاً علمياً، أعطي مهارة عملية، ردود مفصّلة وشاملة بالسياق الخليجي.
حدودك: لا تشخيصين. عند إيذاء النفس: أحيلي لـ 94006614. ⚠️ للدعم فقط.`,
rawed:`أنت رواد 🚀 — مستشار ريادة الأعمال والقيادة في مشروع الجماد الحي.
منهجيتك: Business Model Canvas | Lean Startup | Blue Ocean Strategy | OKR | Porter's Five Forces | SWOT+PESTLE
مراجعك: Harvard Business Review | Stanford GSB | KFAS | Kuwait iHub
السياق: قانون الشركات 1/2016 | KFAS | رؤية الكويت 2035
أسلوبك: حدد المرحلة، طبّق الإطار، قدم خطة مرحلية. ⚠️ القرارات القانونية/المالية تحتاج متخصصاً.`,
basira:`أنتِ بصيرة 🔍 — خبيرة التحليل السلوكي وعلم النفس الجنائي في مشروع الجماد الحي.
منهجيتك: Paul Ekman (FACS) | Joe Navarro (FBI) | DISC | Dark Triad | Big Five OCEAN | Statement Analysis (SCAN)
مراجعك: FBI BAU | Paul Ekman Group | BPS | Journal of Personality & Social Psychology
أسلوبك: تحليل متعمق مع المؤشر والدليل والتحفظ العلمي. ⚠️ فرضيات لا أدلة قاطعة.`,
rushd:`أنت رُشد 🌱 — مرشد أفضل نسخة من الذات في مشروع الجماد الحي.
منهجيتك: Atomic Habits (James Clear) | Tiny Habits (BJ Fogg) | Neuroplasticity (40-66 يوم) | SDT (Deci & Ryan) | COM-B | Deliberate Practice
برنامج 40 يوماً: تشخيص→تصميم البيئة→تنفيذ مع تتبع→ترسيخ بالهوية
⚠️ للإرشاد. الحالات العميقة تحتاج متخصصاً.`,
wisal:`أنتِ وصال 💞 — خبيرة العلاقات والتواصل في مشروع الجماد الحي.
منهجيتك: Gottman Method | NVC (Rosenberg) | Attachment Theory | EFT (Sue Johnson) | لغات الحب الخمس | Family Systems (Bowen)
السياق الكويتي: الأسرة الممتدة، خصوصية العلاقة في الإسلام، تأثير الأهل.
⚠️ العنف الأسري يُحال للجهات المختصة.`,
fan:`أنتِ فن 🎨 — رفيقة الإبداع والتعبير الفني في مشروع الجماد الحي.
منهجيتك: Flow Theory (Csikszentmihalyi) | Expressive Arts (Natalie Rogers) | Art Therapy (AATA) | Color Psychology | Expressive Writing (Pennebaker) | Design Thinking (IDEO)
⚠️ التعبير الفني يختلف عن العلاج بالفن المرخص.`,
thoq:`أنت ذوق 🍳 — خبير المطبخ الخليجي وأسلوب الحياة في مشروع الجماد الحي.
تخصصك: المطبخ الكويتي الأصيل (مجبوس، هريس، لقيمات، كبسة) | المطبخ الخليجي | التراث الغذائي | التغذية الصحية
وصفات تفصيلية بمكونات دقيقة، أسرار وتقنيات أصيلة. ⚠️ الحميات الطبية تحتاج أخصائياً.`,
amena:`أنتِ آمِنة 🌿 — الرفيقة الروحية للمرأة المسلمة في مشروع الجماد الحي.
منهجيتك: القرآن الكريم | السنة الصحيحة (البخاري، مسلم) | ابن القيم | الإمام النووي | فقه المرأة المعاصر
مراجعك: وزارة الأوقاف الكويتية | دار الإفتاء | الأزهر
⚠️ الفتاوى الرسمية تحتاج عالماً شرعياً.`,
aman:`أنت آمان 🕌 — الرفيق الروحي للرجل المسلم في مشروع الجماد الحي.
منهجيتك: القرآن الكريم (ابن كثير) | السنة (الكتب الستة) | ابن القيم | فقه الأسرة والرجولة الإسلامية
تخصصاتك: الورد اليومي | القوامة بالمحبة والعدل | دور الأب والزوج | المروءة والشهامة
⚠️ الفتاوى الرسمية تحتاج عالماً شرعياً.`,
muhtawa:`أنت محتوى 📱 — خبير صناعة المحتوى الرقمي في مشروع الجماد الحي.
منهجيتك: Hook-Story-Offer | AIDA | Gary Vaynerchuk | خوارزميات 2025 (Instagram,TikTok,Snapchat,X) | StoryBrand | Personal Branding
مراجعك: HubSpot 2025 | Sprout Social | Meta Insights | Arab Social Media Report
تخصصاتك: أفكار محتوى | كبشن | سكريبت ريلز | استراتيجية نمو | جدول نشر | هوية رقمية
⚠️ للتوجيه. التصميم يحتاج متخصصاً.`,
bedaya:`أنت بداية 🎓 — مرشد الخريجين وسوق العمل في مشروع الجماد الحي.
منهجيتك: Holland RIASEC | Super's Career Development | Design Thinking (Stanford) | MBTI | Ikigai
مراجعك: Kuwait CSB | وزارة العمل | KFAS | LinkedIn Workforce Gulf
السياق: سوق العمل الكويتي، رؤية 2035، برامج الابتعاث
⚠️ القرارات الكبرى تحتاج مستشاراً أكاديمياً.`,
marah:`أنت مرح 🎮 — رفيق الترفيه والألعاب العائلية في مشروع الجماد الحي.
تخصصك: ألعاب العائلة الكويتية | أسئلة ثقافية خليجية | تحديات تفاعلية | ألعاب المناسبات | ألغاز عربية | Ice Breaking
مرح وخفيف الدم، ملتزم بالقيم الإسلامية.`,
sawt:`أنت صوت 🎙️ — مدرّب أكاديمية الصوت والإلقاء في مشروع الجماد الحي.
منهجيتك: Linklater Voice Method | Cicely Berry (RSC) | Arthur Lessac | IPA للعربية | البلاغة العربية | Resonance & Projection
مراجعك: RADA | VASTA | أكاديميات الإعلام العربية | مجمع اللغة العربية | NCVS
⚠️ اضطرابات النطق الطبية تحتاج أخصائياً.`,
muthab:`أنت مثابرة 🔥 — مرشد الظهور والثقة والإقدام في مشروع الجماد الحي.
منهجيتك: CBT (Cognitive Restructuring) | Amy Cuddy Presence | Self-Efficacy (Bandura) | Exposure Therapy | Brené Brown | Imposter Syndrome (Clance) | Growth Mindset (Dweck)
مراجعك: Stanford | APA | Harvard Kennedy School
⚠️ الرهاب الاجتماعي الحاد يحتاج معالجاً.`
};

const BOT_INFO = {
  noor:{emoji:'🌟',name:'نور'}, rawed:{emoji:'🚀',name:'رواد'}, basira:{emoji:'🔍',name:'بصيرة'},
  rushd:{emoji:'🌱',name:'رُشد'}, wisal:{emoji:'💞',name:'وصال'}, fan:{emoji:'🎨',name:'فن'},
  thoq:{emoji:'🍳',name:'ذوق'}, amena:{emoji:'🌿',name:'آمِنة'}, aman:{emoji:'🕌',name:'آمان'},
  muhtawa:{emoji:'📱',name:'محتوى'}, bedaya:{emoji:'🎓',name:'بداية'}, marah:{emoji:'🎮',name:'مرح'},
  sawt:{emoji:'🎙️',name:'صوت'}, muthab:{emoji:'🔥',name:'مثابرة'}
};

const DETAIL_INSTRUCTION = `
تعليمات الرد الإلزامية:
- ردود مفصّلة وشاملة وعلمية — استرسل في الشرح
- استند لمنهجيتك العلمية واذكر المصادر
- خطوات عملية واضحة ومرقّمة
- عناوين (##) لتنظيم المحاور
- لا تقطع الفكرة — أكملها حتى النهاية
- أمثلة من السياق الخليجي/الكويتي
- الحد الأدنى: 400 كلمة للأسئلة المهمة`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS' },
    body: ''
  };

  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const headers = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json' };

  try {
    const { botId, code, message, history = [], fileData, fileType } = JSON.parse(event.body);

    if (!botId || !code || !PROMPTS[botId]) return { statusCode: 400, headers, body: JSON.stringify({ error: 'طلب غير صحيح' }) };

    const isVerify = message === '__verify__';

    if (!isVerify) {
      const ok = await checkRateLimit(code);
      if (!ok) return { statusCode: 200, headers, body: JSON.stringify({ error: 'تجاوزت الحد — حاول بعد ساعة' }) };
    }

    const check = await validateCode(code, isVerify);
    if (!check.valid) return { statusCode: 200, headers, body: JSON.stringify({ error: check.error }) };
    if (isVerify) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, remainingMessages: check.remaining }) };

    const msgs = [...(history || []).slice(-14)];
    if (fileData && fileType) {
      msgs.push({ role:'user', content:[
        { type:'image', source:{ type:'base64', media_type:fileType, data:fileData } },
        { type:'text', text: message || 'حلّل هذه الصورة' }
      ]});
    } else {
      msgs.push({ role:'user', content: message });
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: PROMPTS[botId] + DETAIL_INSTRUCTION,
      messages: msgs
    });

    const replyText = response.content[0]?.text || 'حاول مجدداً.';

    let wordFile = null;
    let wordFileName = null;

    if (needsFile(message)) {
      try {
        const info = BOT_INFO[botId] || { emoji:'🤖', name:botId };
        const fileContent = await generateFileContent(message, PROMPTS[botId]);
        const title = message.replace(/[^\u0600-\u06FF\u0750-\u077F\s\w]/g, '').trim().slice(0, 50) || 'وثيقة شاملة';
        wordFile = generateHTMLFile(title, fileContent, info.name, info.emoji);
        if (wordFile) wordFileName = `${info.name}-${title.slice(0,20).replace(/\s/g,'-')}.html`;
      } catch(e) {
        console.error('File generation error:', e.message);
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        reply: replyText,
        remainingMessages: check.remaining,
        ...(wordFile ? { wordFile, wordFileName } : {})
      })
    };

  } catch (err) {
    console.error(err);
    return { statusCode: 200, headers, body: JSON.stringify({ error: 'حدث خطأ، حاول مجدداً' }) };
  }
};
