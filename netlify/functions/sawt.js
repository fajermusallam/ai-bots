const Anthropic = require('@anthropic-ai/sdk');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL   || 'https://keen-ant-82868.upstash.io';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAAAUO0AAIncDFjMGE3Y2MzODU3NzM0YTI0ODI0OTg3M2ZhZDA5ZTUwOHAxODI4Njg';

const DEMO_CODES = ['SW-DEMO-2026','SW-TEST-2026','SW-TEST-0001','SW-0001-SAWT'];

// ── REDIS ──────────────────────────────────────────────
async function redisGet(key) {
  const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  const d = await r.json();
  return d.result ? JSON.parse(d.result) : null;
}

async function redisSet(key, val) {
  await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(val))}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
}

async function redisIncr(key) {
  const r = await fetch(`${UPSTASH_URL}/incr/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  const d = await r.json();
  return d.result;
}

async function redisExpire(key, ttl) {
  await fetch(`${UPSTASH_URL}/expire/${encodeURIComponent(key)}/${ttl}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
}

// ── CODE VALIDATION (مُصلحة) ───────────────────────────
async function validateCode(code, isVerifyOnly = false) {
  if (DEMO_CODES.includes(code)) return { valid: true, remaining: 99 };

  const data = await redisGet(`sw:${code}`);
  if (!data)               return { valid: false, error: 'الكود غير صحيح أو غير موجود' };
  if (data.remaining <= 0) return { valid: false, error: 'انتهت رسائل هذا الكود' };

  if (!isVerifyOnly) {
    data.remaining -= 1;
    data.used = true;
    await redisSet(`sw:${code}`, data);
  }
  return { valid: true, remaining: data.remaining };
}

async function checkRateLimit(code) {
  const key   = `rate:sawt:${code}:${Math.floor(Date.now() / 3600000)}`;
  const count = await redisIncr(key);
  if (count === 1) await redisExpire(key, 3600);
  return count <= 50;
}

// ── WORD FILE GENERATOR ────────────────────────────────
async function generateWordFile(title, content) {
  const lines = content.split('\n');
  const children = [];

  // Header
  children.push(
    new Paragraph({
      children: [new TextRun({
        text: `🎙️ ${title}`,
        bold: true, size: 40, font: 'Arial', color: '1a0533'
      })],
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 200 }
    }),
    new Paragraph({
      children: [new TextRun({
        text: 'أكاديمية صوت SAWT | مشروع الجماد الحي — فجر عبدالرحمن المسلم',
        size: 20, font: 'Arial', color: '7c3aed', italics: true
      })],
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 400 }
    })
  );

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
      continue;
    }

    if (trimmed.startsWith('### ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed.slice(4), bold: true, size: 26, font: 'Arial', color: '059669' })],
        heading: HeadingLevel.HEADING_3,
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { before: 200, after: 80 }
      }));
    } else if (trimmed.startsWith('## ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed.slice(3), bold: true, size: 28, font: 'Arial', color: '7c3aed' })],
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { before: 250, after: 100 }
      }));
    } else if (trimmed.startsWith('# ') && !trimmed.startsWith('##')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed.slice(2), bold: true, size: 32, font: 'Arial', color: '1a0533' })],
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { before: 300, after: 150 }
      }));
    } else if (/^[-•*٠]/.test(trimmed) || /^[١٢٣٤٥٦٧٨٩\d][\.\-\)]/.test(trimmed)) {
      const text = trimmed.replace(/^[-•*٠]\s*/, '').replace(/^[١٢٣٤٥٦٧٨٩\d][\.\-\)]\s*/, '');
      children.push(new Paragraph({
        children: [
          new TextRun({ text: '◈ ', bold: true, color: '7c3aed', font: 'Arial', size: 22 }),
          new TextRun({ text, font: 'Arial', size: 22 })
        ],
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        indent: { right: 300 },
        spacing: { after: 80 }
      }));
    } else if (trimmed.includes('**')) {
      const parts = trimmed.split(/\*\*([^*]+)\*\*/g);
      const runs = parts.map((part, i) =>
        new TextRun({ text: part, bold: i % 2 === 1, font: 'Arial', size: 22 })
      );
      children.push(new Paragraph({
        children: runs,
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { after: 100 }
      }));
    } else {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed, font: 'Arial', size: 22 })],
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { after: 100 }
      }));
    }
  }

  // Footer
  children.push(
    new Paragraph({ text: '', spacing: { before: 400 } }),
    new Paragraph({
      children: [new TextRun({ text: '─────────────────────────────────────────', color: 'cccccc', font: 'Arial', size: 20 })],
      alignment: AlignmentType.CENTER
    }),
    new Paragraph({
      children: [new TextRun({
        text: '© حقوق محفوظة لـ فجر عبدالرحمن المسلم — مؤسسة مشروع الجماد الحي',
        size: 18, font: 'Arial', color: '999999', italics: true
      })],
      alignment: AlignmentType.CENTER,
      bidirectional: true
    })
  );

  const doc = new Document({
    sections: [{ properties: { bidi: true }, children }],
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 22, rightToLeft: true },
          paragraph: { alignment: AlignmentType.RIGHT, bidirectional: true }
        }
      }
    }
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer.toString('base64');
}

function needsWordFile(text) {
  if (!text) return false;
  const triggers = ['ملف', 'وورد', 'word', 'تقرير', 'وثيقة', 'مستند',
                    'احفظ', 'اعطني ملف', 'أرسل ملف', 'تلخيص مكتوب',
                    'خطة مكتوبة', 'دليل', 'نموذج', 'قالب', 'برنامج تدريبي', 'كتيب'];
  const lower = text.toLowerCase();
  return triggers.some(t => lower.includes(t));
}

// ── SAWT SYSTEM PROMPT ─────────────────────────────────
const SAWT_SYSTEM_AR = `أنت "صوت" — مدرّب أكاديمية الصوت والإلقاء في مشروع الجماد الحي.
خبير في تطوير الصوت والإلقاء والحضور الصوتي للعرب.

منهجيتك العلمية:
- Linklater Voice Method: تحرير الصوت الطبيعي من التوترات الجسدية
- Cicely Berry (RSC): ربط الصوت بالنص والمعنى والشخصية
- Arthur Lessac Voice Training: Body Wisdom — الرنين والإسقاط
- IPA Phonetics للعربية: النطق الدقيق للأصوات العربية
- علم البلاغة العربية: المد، الوقف، التنغيم، الإيقاع، التشديد
- Resonance & Projection: الحجاب الحاجز، الرنين الصدري/الرأسي
- Speech Level Singing (Seth Riggs): ربط التدريب الصوتي بالأداء
- Complete Vocal Technique (CVT): نظرية الصوت الشاملة
- FACS (Paul Ekman): التعبير الوجهي المصاحب للصوت

مراجعك: RADA | VASTA | أكاديميات الإعلام العربية | مجمع اللغة العربية | National Center for Voice and Speech (NCVS)

تخصصاتك التفصيلية:
١. تطوير النبرة وطبقات الصوت: التنفس الحجابي، الرنين الثلاثي، التحكم في الطبقة
٢. الإلقاء والخطابة: الإيقاع، التوقف الذكي، التنغيم، قوة الصوت
٣. الحضور الصوتي: الثقة، الإسقاط، الوضوح، الانعكاسية
٤. نطق الفصحى المعيارية: تصحيح الأخطاء الشائعة في الخليجيين
٥. إنشاء المحتوى الصوتي: فويس أوفر، بودكاست، تدريس، خطابة
٦. التغلب على رهاب الكلام: التقنيات المعرفية والجسدية

أسلوبك:
- الردود مفصّلة وعلمية وعملية — استرسل في الشرح الكامل
- قدم تمارين صوتية كاملة الخطوات مع التوقع والنتيجة
- اذكر المرجع العلمي والمنهجية
- اعمل على جانب واحد بعمق في كل محادثة لا سطحية واسعة
- شجّع على التسجيل والاستماع المنتظم للتطور
- الحد الأدنى: 400 كلمة للأسئلة التدريبية

عند طلب ملف: أنشئ برنامج تدريب صوتي كاملاً أو دليلاً تفصيلياً بالتمارين.
⚠️ اضطرابات النطق الطبية (تأتأة، بحّة مزمنة) تحتاج أخصائي نطق وتخاطب طبياً.`;

const SAWT_SYSTEM_EN = `You are "SAWT" — a professional voice and speech trainer at Mashrou' Al Jamad Al Hayy.

Scientific methodology:
- Linklater Voice Method: Freeing the Natural Voice
- Cicely Berry (RSC): Voice and the Actor — connecting voice to text
- Arthur Lessac: Body Wisdom — resonance and projection
- IPA Phonetics for Arabic: precise sound production
- Arabic Rhetoric: prosody, pause, intonation, rhythm
- CVT (Complete Vocal Technique): comprehensive vocal theory
- NCVS research: voice science and health

Your specialties: tone development, public speaking, vocal presence, Arabic pronunciation, content creation voice, performance anxiety.

Response style:
- Detailed, scientific, practical — elaborate fully
- Give complete step-by-step exercises with expected outcomes
- Cite methodology and sources
- Minimum 400 words for training questions

When a file is requested: create a complete vocal training program or detailed exercise guide.
⚠️ Medical speech disorders need a licensed speech-language pathologist.`;

// ── HANDLER ───────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const body = JSON.parse(event.body);
    const { type, code, system, messages, max_tokens } = body;

    // ── التحقق من الكود لجميع الطلبات
    if (code) {
      const isVerify = body.message === '__verify__';
      if (!isVerify) {
        const rateOk = await checkRateLimit(code);
        if (!rateOk) return {
          statusCode: 200, headers,
          body: JSON.stringify({ content: [{ text: 'تجاوزت الحد — حاول بعد ساعة' }] })
        };
      }
      const check = await validateCode(code, isVerify);
      if (!check.valid) return {
        statusCode: 200, headers,
        body: JSON.stringify({ content: [{ text: check.error }] })
      };
      if (isVerify) {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, remaining: check.remaining }) };
      }
    }

    // ── FIX: دمج chat + content + extract في معالج واحد
    if (['chat', 'content', 'extract'].includes(type)) {
      const tokens = type === 'extract' ? 200 : (max_tokens || 4096);

      // اختار النظام المناسب
      let systemPrompt = system;
      if (!systemPrompt && type === 'chat') {
        const lang = body.lang || 'ar';
        systemPrompt = lang === 'en' ? SAWT_SYSTEM_EN : SAWT_SYSTEM_AR;
      }

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: tokens,
        system: systemPrompt,
        messages: messages || []
      });

      const text = response.content[0]?.text || '';

      // إنشاء ملف Word عند الطلب (فقط لـ chat و content)
      let wordFile = null;
      let wordFileName = null;

      if (type !== 'extract' && code) {
        const lastUserMsg = [...(messages || [])].reverse().find(m => m.role === 'user');
        const userText = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
        if (needsWordFile(userText)) {
          try {
            const title = userText.slice(0, 60).replace(/[^\u0600-\u06FF\u0750-\u077F\s\w]/g, '').trim() || 'دليل صوتي شامل';
            wordFile = await generateWordFile(title, text);
            wordFileName = `صوت-${title.slice(0,20).replace(/\s/g,'-')}-${Date.now()}.docx`;
          } catch(e) {
            console.error('Word generation error:', e.message);
          }
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          content: [{ text }],
          ...(wordFile ? { wordFile, wordFileName } : {})
        })
      };
    }

    return {
      statusCode: 400, headers,
      body: JSON.stringify({ error: 'نوع طلب غير معروف' })
    };

  } catch (err) {
    console.error('Sawt function error:', err);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ content: [{ text: 'عذراً، حدث خطأ. حاول مجدداً.' }] })
    };
  }
};
