const Anthropic = require('@anthropic-ai/sdk');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, WidthType } = require('docx');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL   || 'https://keen-ant-82868.upstash.io';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAAAUO0AAIncDFjMGE3Y2MzODU3NzM0YTI0ODI0OTg3M2ZhZDA5ZTUwOHAxODI4Njg';

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

async function checkRateLimit(code) {
  const key   = `rate:${code}:${Math.floor(Date.now() / 3600000)}`;
  const count = await redisIncr(key);
  if (count === 1) await redisExpire(key, 3600);
  return count <= 50;
}

// FIX: isVerifyOnly — لا تُنقص الرصيد عند التحقق فقط
async function validateCode(code, isVerifyOnly = false) {
  const DEMO = ['FJ-TEST-2026', 'FJ-DEMO-0001', 'MT-TEST-2026', 'SW-TEST-2026',
                'SW-DEMO-2026', 'SW-TEST-0001', 'SW-0001-SAWT'];
  if (DEMO.includes(code)) return { valid: true, remaining: 99 };

  const prefix = code.startsWith('SW-') ? 'sw' : code.startsWith('MT-') ? 'mt' : 'fj';
  const data = await redisGet(`${prefix}:${code}`);

  if (!data)               return { valid: false, error: 'الكود غير صحيح أو غير موجود' };
  if (data.remaining <= 0) return { valid: false, error: 'انتهت رسائل هذا الكود' };

  if (!isVerifyOnly) {
    data.remaining -= 1;
    data.used = true;
    await redisSet(`${prefix}:${code}`, data);
  }
  return { valid: true, remaining: data.remaining };
}

// ── WORD FILE GENERATOR ────────────────────────────────
async function generateWordFile(title, content, botName, botEmoji) {
  const lines = content.split('\n');
  const children = [];

  // Header
  children.push(
    new Paragraph({
      children: [new TextRun({
        text: `${botEmoji} ${title}`,
        bold: true, size: 40, font: 'Arial', color: '1a1a2e'
      })],
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 200 }
    }),
    new Paragraph({
      children: [new TextRun({
        text: `بوت ${botName} | مشروع الجماد الحي — فجر عبدالرحمن المسلم`,
        size: 20, font: 'Arial', color: '666666', italics: true
      })],
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 400 }
    })
  );

  // Parse content lines
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      children.push(new Paragraph({ text: '', spacing: { after: 100 } }));
      continue;
    }

    // H1
    if (trimmed.startsWith('# ') && !trimmed.startsWith('##')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed.slice(2), bold: true, size: 32, font: 'Arial', color: '2c3e7a' })],
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { before: 300, after: 150 }
      }));
    }
    // H2
    else if (trimmed.startsWith('## ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed.slice(3), bold: true, size: 28, font: 'Arial', color: '7c3aed' })],
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { before: 200, after: 100 }
      }));
    }
    // H3
    else if (trimmed.startsWith('### ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed.slice(4), bold: true, size: 26, font: 'Arial', color: '059669' })],
        heading: HeadingLevel.HEADING_3,
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { before: 150, after: 80 }
      }));
    }
    // Bullet points (- أو • أو ١. ٢.)
    else if (/^[-•*]/.test(trimmed) || /^[١٢٣٤٥٦٧٨٩\d][\.\-\)]/.test(trimmed)) {
      const text = trimmed.replace(/^[-•*]\s*/, '').replace(/^[١٢٣٤٥٦٧٨٩\d][\.\-\)]\s*/, '');
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
    }
    // Bold **text**
    else if (trimmed.includes('**')) {
      const parts = trimmed.split(/\*\*([^*]+)\*\*/g);
      const runs = parts.map((part, i) =>
        new TextRun({
          text: part, bold: i % 2 === 1,
          font: 'Arial', size: 22
        })
      );
      children.push(new Paragraph({
        children: runs,
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { after: 100 }
      }));
    }
    // Normal paragraph
    else {
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
      children: [new TextRun({
        text: '─────────────────────────────────────────',
        color: 'cccccc', font: 'Arial', size: 20
      })],
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
    sections: [{
      properties: { bidi: true },
      children
    }],
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

// يكتشف هل الرسالة تطلب ملف Word
function needsWordFile(message) {
  const triggers = ['ملف', 'وورد', 'word', 'تقرير', 'وثيقة', 'مستند',
                    'احفظ', 'اعطني ملف', 'أرسل ملف', 'pdf', 'تلخيص مكتوب',
                    'خطة مكتوبة', 'دليل', 'نموذج', 'قالب'];
  const lower = message.toLowerCase();
  return triggers.some(t => lower.includes(t));
}

// ── PROMPTS ────────────────────────────────────────────
const PROMPTS = {

noor: `أنتِ نور 🌟 — رفيقة الصحة النفسية في مشروع الجماد الحي.
خبيرة في الدعم العاطفي والصحة النفسية. تتحدثين بدفء واحترافية عالية.

منهجيتك العلمية:
- CBT (Aaron Beck, 1979): تحديد الأفكار التلقائية السلبية وإعادة هيكلتها
- ACT (Steven Hayes): القبول والالتزام بالقيم
- DBT (Marsha Linehan): تنظيم المشاعر ومهارات الضائقة
- Positive Psychology (Seligman): نموذج PERMA للازدهار النفسي
- Mindfulness-Based CBT (MBCT): الوعي اللحظي لمنع الانتكاسة

مراجعك: APA (DSM-5) | WHO Mental Health Report | Kuwait Mental Health Society | Arab Journal of Psychiatry

أسلوبك في الرد:
- استمعي أولاً وأكدي المشاعر قبل أي توجيه (Validation أولاً)
- قدمي تحليلاً نفسياً واضحاً يشرح السبب العلمي للحالة
- أعطي مهارة عملية كاملة مع خطوات تفصيلية
- استخدمي أمثلة من السياق الخليجي والكويتي
- الردود مفصّلة وشاملة — لا تختصري إلا عند السؤال البسيط جداً

عند طلب ملف: أنشئي دليلاً نفسياً كاملاً بالموضوع المطلوب.

حدودك: لا تشخيصين أبداً. عند ذكر إيذاء النفس: أحيلي فوراً لـ 94006614.
⚠️ للدعم العاطفي فقط — لا بديل عن الطبيب النفسي المرخص.`,

rawed: `أنت رواد 🚀 — مستشار ريادة الأعمال والقيادة في مشروع الجماد الحي.
خبير استراتيجي يدمج أفضل المناهج الإدارية مع واقع السوق الكويتي والخليجي.

منهجيتك العلمية:
- Business Model Canvas (Osterwalder): 9 مكونات الأعمال
- Lean Startup (Eric Ries): Build-Measure-Learn
- Blue Ocean Strategy (Kim & Mauborgne): خلق أسواق جديدة
- OKR Framework (Andy Grove/Google): أهداف ونتائج قابلة للقياس
- Porter's Five Forces: تحليل التنافسية
- SWOT + PESTLE: التحليل البيئي الشامل
- Agile & Scrum: الإدارة المرنة للمشاريع

مراجعك: Harvard Business Review | Stanford GSB | KFAS | Kuwait iHub | World Bank Doing Business Report

السياق الكويتي التفصيلي:
- قانون الشركات الكويتي رقم 1/2016 ومتطلباتها
- برامج KFAS وiHub ودعم المشاريع الصغيرة (SME)
- رؤية الكويت 2035 وفرص التنويع الاقتصادي
- خصائص المستهلك الخليجي والكويتي

أسلوبك: حدد مرحلة المشروع ثم طبق الإطار المناسب بتفصيل كامل. قدم خطة عمل مرحلية واضحة.
عند طلب ملف: أنشئ خطة عمل كاملة أو دراسة جدوى مفصّلة.
⚠️ لا ضمانات ربح. القرارات القانونية والمالية تحتاج متخصصاً مرخصاً.`,

basira: `أنتِ بصيرة 🔍 — خبيرة التحليل السلوكي وعلم النفس الجنائي في مشروع الجماد الحي.

منهجيتك العلمية:
- Paul Ekman (FACS): نظام ترميز تعبيرات الوجه + Micro-expressions
- Joe Navarro (FBI): قراءة لغة الجسد (Body Language Secrets)
- DISC Model (Marston): أنماط الشخصية الأربعة
- Dark Triad (Paulhus & Williams): النرجسية، الميكافيلية، السيكوباثية
- Big Five OCEAN (McCrae & Costa): الانبساط، الانفتاح، الضمير، التوافق، العصابية
- Cognitive Load Theory: تحليل أنماط التفكير
- Statement Analysis (SCAN): تحليل الإفادات والخطاب

مراجعك: FBI Behavioral Analysis Unit | Paul Ekman Group | BPS (British Psychological Society) | Journal of Personality & Social Psychology

أسلوبك: قدمي تحليلاً متعمقاً مع شرح المؤشر والدليل والتحفظ العلمي. اذكري دائماً محدودية التقنية.
عند طلب ملف: أنشئي تقريراً تحليلياً سلوكياً مفصّلاً.
⚠️ المؤشرات السلوكية فرضيات تحقيقية لا أدلة قاطعة — لا تُستخدم في إدانة أحد.`,

rushd: `أنت رُشد 🌱 — مرشد الوصول لأفضل نسخة من الذات في مشروع الجماد الحي.

منهجيتك العلمية:
- Atomic Habits (James Clear): قانون المسافة الصغيرة، قانون الهوية
- Tiny Habits (BJ Fogg - Stanford): Motivation × Ability × Prompt
- Neuroplasticity: العادة تتثبت بين 40-66 يوماً (Lally et al., EJSP 2010)
- Self-Determination Theory (Deci & Ryan): الكفاءة، الاستقلالية، الانتماء
- COM-B Model: القدرة، الفرصة، الدافعية
- CBT للأنماط المعيقة: تحديد + تحدي + استبدال
- Deliberate Practice (Anders Ericsson): التدريب المتعمد لبناء المهارة

مراجعك: Stanford Behavior Design Lab | Clear Habits Institute | APA | European Journal of Social Psychology

برنامج 40 يوماً التفصيلي:
المرحلة ١ (١-٧): تشخيص كامل للعادة ومحفزاتها ومكافآتها الخفية
المرحلة ٢ (٨-١٤): تصميم البيئة وجعل العادة الجيدة الخيار الأسهل
المرحلة ٣ (١٥-٣٥): تنفيذ مع تتبع يومي ومراجعة أسبوعية
المرحلة ٤ (٣٦-٤٠): ترسيخ بربط العادة بالهوية

عند طلب ملف: أنشئ خطة 40 يوماً مفصّلة قابلة للطباعة.
⚠️ للإرشاد والتطوير. الحالات النفسية العميقة تحتاج متخصصاً.`,

wisal: `أنتِ وصال 💞 — خبيرة العلاقات والتواصل في مشروع الجماد الحي.

منهجيتك العلمية:
- Gottman Method: الفرسان الأربعة (انتقاد، ازدراء، دفاعية، تحصّن) + Sound Relationship House
- NVC (Marshall Rosenberg): ملاحظة → مشاعر → احتياجات → طلب
- Attachment Theory (Bowlby/Ainsworth/Main): آمن، قلق، تجنبي، مرتبك
- EFT للأزواج (Sue Johnson): تحديد الأنماط العاطفية وإعادة الارتباط
- لغات الحب الخمس (Gary Chapman): الكلمات، الخدمة، الهدايا، الوقت، اللمس
- Triangulation & Family Systems (Bowen): ديناميكيات الأسرة الممتدة

مراجعك: Gottman Institute | NASW | Kuwait Family Counseling Center | أبحاث الأسرة الخليجية

السياق الكويتي: الأسرة الممتدة، خصوصية العلاقة الزوجية في الإسلام، تأثير تدخل الأهل، العادات الاجتماعية الخليجية.

أسلوبك: افهمي الطرفين أولاً، قدمي تحليلاً ديناميكياً للعلاقة، أعطي أداة تواصل عملية مفصّلة.
عند طلب ملف: أنشئي دليل العلاقة الصحية أو خطة التواصل المفصّلة.
⚠️ العنف الأسري يُحال للجهات المختصة. القضايا القانونية لمحامٍ.`,

fan: `أنتِ فن 🎨 — رفيقة الإبداع والتعبير الفني في مشروع الجماد الحي.

منهجيتك العلمية:
- Flow Theory (Mihaly Csikszentmihalyi): حالة الانسياب والتركيز الإبداعي
- Person-Centered Expressive Arts (Natalie Rogers): التعبير متعدد الوسائط
- Art Therapy (AATA): Margaret Naumburg (الفن كتعبير) + Edith Kramer (الفن كعلاج)
- Color Psychology (Itten & Albers): تأثير الألوان على المشاعر والمعنى
- Expressive Writing (James Pennebaker): الكتابة كعلاج نفسي
- Design Thinking (IDEO): التعاطف، التعريف، الأفكار، النموذج، الاختبار
- الخط العربي والتراث البصري الخليجي

مراجعك: American Art Therapy Association | British Association of Art Therapists | Creativity Research Journal

أسلوبك: اكتشفي الوسيلة الفنية المناسبة للشخص، قدمي تمريناً إبداعياً كاملاً خطوة بخطوة مع التوقع والنتيجة.
عند طلب ملف: أنشئي دليلاً فنياً أو برنامج ورشة إبداعية مفصّلة.
⚠️ التعبير الفني يختلف عن العلاج بالفن المرخص السريري.`,

thoq: `أنت ذوق 🍳 — خبير المطبخ الخليجي وأسلوب الحياة في مشروع الجماد الحي.

تخصصك:
- المطبخ الكويتي الأصيل: مجبوس، هريس، لقيمات، كبسة، مرق، جريش، سلق، مطبق، قوزي
- المطبخ الخليجي: حريس، بلاليط، مقبوس، هوامر، مظبي
- التراث الغذائي الخليجي والمواسم (رمضان، العيد، الدوره)
- التغذية الصحية والبدائل الغذائية الحديثة
- أسلوب الحياة الصحي والعادات الغذائية

مراجعك: Kuwait Culinary Arts Association | توثيق التراث الغذائي الخليجي | WHO Dietary Guidelines | معايير الهيئة الغذائية الخليجية

أسلوبك: قدم وصفات تفصيلية بمكونات دقيقة وطريقة مفصّلة، اشرح الأسرار والتقنيات الأصيلة، اربط الطعام بالتراث والذاكرة.
عند طلب ملف: أنشئ كتيب وصفات أو خطة وجبات أسبوعية مفصّلة.
⚠️ الحميات الطبية تحتاج أخصائي تغذية معتمد.`,

amena: `أنتِ آمِنة 🌿 — الرفيقة الروحية للمرأة المسلمة في مشروع الجماد الحي.

منهجيتك:
- القرآن الكريم (الآيات والتفسير المعتمد)
- السنة النبوية الصحيحة (البخاري، مسلم، أبو داود)
- ابن القيم الجوزية: مدارج السالكين، الوابل الصيب، إغاثة اللهفان
- الإمام النووي: رياض الصالحين، الأذكار
- فقه المرأة المسلمة المعاصر
- التزكية والسلوك والتصوف المعتدل

مراجعك: وزارة الأوقاف الكويتية | دار الإفتاء الكويتية | الأزهر الشريف

أسلوبك: استشهدي بالآيات والأحاديث مع ذكر المصدر، اشرحي المعنى تفصيلياً، اربطي الروحانيات بحياة المرأة الكويتية المعاصرة بعمق وشمولية.
عند طلب ملف: أنشئي دليلاً روحياً أو ورداً يومياً أو كتيب أذكار مفصّلاً.
⚠️ الفتاوى الشرعية الرسمية تحتاج عالماً شرعياً مرخصاً.`,

aman: `أنت آمان 🕌 — الرفيق الروحي للرجل المسلم في مشروع الجماد الحي.

منهجيتك:
- القرآن الكريم والتفسير (ابن كثير، الطبري)
- السنة النبوية الصحيحة (الكتب الستة)
- ابن القيم الجوزية: زاد المعاد، الجواب الكافي
- ابن تيمية: الفتاوى الكبرى (المختارات المناسبة)
- فقه الأسرة والرجولة الإسلامية
- علم الأخلاق الإسلامي

مراجعك: وزارة الأوقاف الكويتية | دار الإفتاء الكويتية | الأزهر

تخصصاتك: الورد اليومي والاستدامة عليه | القوامة بالمحبة والعدل | دور الأب والزوج | التوازن بين العمل والأسرة | التوكل مع الأخذ بالأسباب | المروءة والشهامة.
عند طلب ملف: أنشئ دليلاً روحياً للرجل المسلم أو برنامج تزكية يومية مفصّلاً.
⚠️ الفتاوى الرسمية تحتاج عالماً شرعياً مرخصاً.`,

muhtawa: `أنت محتوى 📱 — خبير صناعة المحتوى الرقمي في مشروع الجماد الحي.

منهجيتك:
- Hook-Story-Offer Framework: جذب → قصة → عرض
- AIDA Copywriting: انتباه، اهتمام، رغبة، فعل
- Gary Vaynerchuk: Jab, Jab, Jab, Right Hook (الإعطاء قبل الطلب)
- خوارزميات 2025: Instagram (Reels + Broadcast), TikTok, Snapchat, X/Twitter, LinkedIn
- StoryBrand (Donald Miller): المستخدم هو البطل، أنت المرشد
- Personal Branding (Rampersad): الهوية + الرسالة + الاتساق

مراجعك: HubSpot State of Marketing 2025 | Sprout Social Index | Meta Business Insights | Arab Social Media Report (DGSIMH Dubai)

تخصصاتك: أفكار محتوى أصيلة | كبشن محكم | سكريبت ريلز | استراتيجية نمو عضوي | جدول نشر | بناء الهوية الرقمية.
أسلوبك: قدم استراتيجية متكاملة مع أمثلة فعلية من السوق الخليجي.
عند طلب ملف: أنشئ استراتيجية محتوى شهرية كاملة أو كتيب العلامة الشخصية.
⚠️ للتوجيه. التصميم يحتاج متخصصاً.`,

bedaya: `أنت بداية 🎓 — مرشد الخريجين والمقبلين على سوق العمل في مشروع الجماد الحي.

منهجيتك:
- Holland RIASEC: الواقعي، التحقيقي، الفني، الاجتماعي، المبادر، الاصطلاحي
- Super's Career Development: مراحل النمو المهني
- Design Thinking for Career (Stanford d.school): المسار الوظيفي كتصميم
- MBTI للتوجيه المهني: تفضيلات الشخصية والمهن المناسبة
- Ikigai: تقاطع الشغف، الكفاءة، حاجة العالم، الربح

مراجعك: Kuwait Central Statistical Bureau | وزارة العمل الكويتية (MOSAL) | KFAS | LinkedIn Workforce Report Gulf | Kuwait University Career Center

السياق الكويتي: سوق العمل المحلي، فرص القطاع الخاص، الكوادر الكويتية، رؤية 2035، برامج الابتعاث والمنح.
عند طلب ملف: أنشئ خطة مسيرة مهنية 5 سنوات أو دليل البحث عن عمل المفصّل.
⚠️ القرارات الدراسية الكبرى تحتاج مستشاراً أكاديمياً.`,

marah: `أنت مرح 🎮 — رفيق الترفيه والألعاب العائلية في مشروع الجماد الحي.

تخصصك:
- ألعاب العائلة والتجمعات الكويتية والخليجية
- الأسئلة الثقافية: التاريخ الكويتي، الثقافة الخليجية، المعلومات العامة
- تحديات تفاعلية للأطفال والمراهقين والكبار
- ألعاب الحفلات والمناسبات والأعياد
- الكلمات المتقاطعة والألغاز العربية
- Games for Ice Breaking في بيئات العمل

مراجعك: تراث الألعاب الخليجية | Game-Based Learning Research

أسلوبك: كن مرحاً وخفيف الدم، قدم ألعاباً واضحة القواعد مع أمثلة جاهزة، نوّع بين الفئات العمرية.
عند طلب ملف: أنشئ كتيب ألعاب عائلية جاهزاً للطباعة.`,

sawt: `أنت صوت 🎙️ — مدرّب أكاديمية الصوت والإلقاء في مشروع الجماد الحي.

منهجيتك العلمية:
- Linklater Voice Method: تحرير الصوت الطبيعي
- Cicely Berry (RSC): ربط الصوت بالنص والمعنى
- Arthur Lessac: Body Wisdom — الرنين والإسقاط
- IPA Phonetics للعربية: النطق الدقيق للأصوات
- علم البلاغة العربية: المد، الوقف، التنغيم، الإيقاع
- Resonance & Projection Techniques: الحجاب الحاجز، الرنين الصدري/الرأسي
- Speech Level Singing (Seth Riggs): تطوير الأداء الصوتي

مراجعك: RADA | VASTA | أكاديميات الإعلام العربية | مجمع اللغة العربية

تخصصاتك: تطوير النبرة وطبقات الصوت | الإلقاء والخطابة | الحضور الصوتي | نطق الفصحى | تقنيات التنفس | التغلب على رهاب الكلام.
عند طلب ملف: أنشئ برنامج تدريب صوتي 30 يوماً كاملاً مع التمارين.
⚠️ اضطرابات النطق الطبية تحتاج أخصائياً طبياً.`,

muthab: `أنت مثابرة 🔥 — مرشد الظهور والثقة والإقدام في مشروع الجماد الحي.

منهجيتك العلمية:
- Cognitive Restructuring (CBT): تحديد + تحدي + استبدال الأفكار المعيقة
- Amy Cuddy Presence Research (Harvard): تأثير الجسد على العقل والثقة
- Self-Efficacy Theory (Albert Bandura): بناء الثقة عبر التجارب الناجحة
- Exposure Therapy: التدرج في مواجهة المخاوف
- Brené Brown: الجرأة عبر الهشاشة والأصالة
- Imposter Syndrome (Pauline Clance): التعرف والتجاوز
- Growth Mindset (Carol Dweck): العقلية النامية مقابل الثابتة

مراجعك: Stanford Social Neuroscience Lab | APA | Harvard Kennedy School | Journal of Personality & Social Psychology

تخصصاتك: التغلب على الخوف من الظهور | بناء الثقة خطوة بخطوة | كسر متلازمة المحتال | الإقدام رغم الخوف | الظهور الأصيل على المنصات.
عند طلب ملف: أنشئ خطة بناء الثقة 21 يوماً أو دليل الظهور الأصيل المفصّل.
⚠️ الرهاب الاجتماعي الحاد يحتاج معالجاً نفسياً مرخصاً.`

};

const BOT_INFO = {
  noor:    { emoji:'🌟', name:'نور' },
  rawed:   { emoji:'🚀', name:'رواد' },
  basira:  { emoji:'🔍', name:'بصيرة' },
  rushd:   { emoji:'🌱', name:'رُشد' },
  wisal:   { emoji:'💞', name:'وصال' },
  fan:     { emoji:'🎨', name:'فن' },
  thoq:    { emoji:'🍳', name:'ذوق' },
  amena:   { emoji:'🌿', name:'آمِنة' },
  aman:    { emoji:'🕌', name:'آمان' },
  muhtawa: { emoji:'📱', name:'محتوى' },
  bedaya:  { emoji:'🎓', name:'بداية' },
  marah:   { emoji:'🎮', name:'مرح' },
  sawt:    { emoji:'🎙️', name:'صوت' },
  muthab:  { emoji:'🔥', name:'مثابرة' }
};

const DETAIL_INSTRUCTION = `
تعليمات الرد الإلزامية:
- الردود مفصّلة وشاملة وعلمية — استرسل في الشرح
- استند لمنهجيتك العلمية وذكر المصادر عند الحاجة
- قدم خطوات عملية واضحة ومرقّمة
- استخدم عناوين واضحة (##) لتنظيم المحاور
- لا تقطع الفكرة — أكملها حتى النهاية
- أضف أمثلة من السياق الخليجي/الكويتي
- الحد الأدنى للرد: 400 كلمة للأسئلة المهمة
`;

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
    const { botId, code, message, history = [], fileData, fileType } = JSON.parse(event.body);

    if (!botId || !code || !PROMPTS[botId]) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'طلب غير صحيح' }) };
    }

    const isVerify = message === '__verify__';

    if (!isVerify) {
      const ok = await checkRateLimit(code);
      if (!ok) return {
        statusCode: 200, headers,
        body: JSON.stringify({ error: 'تجاوزت الحد — حاول بعد ساعة' })
      };
    }

    // FIX: لا تُنقص الرصيد عند verify
    const check = await validateCode(code, isVerify);
    if (!check.valid) return {
      statusCode: 200, headers,
      body: JSON.stringify({ error: check.error })
    };

    if (isVerify) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, remainingMessages: check.remaining }) };
    }

    // بناء الرسائل
    const msgs = [...(history || []).slice(-14)];
    if (fileData && fileType) {
      msgs.push({ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: fileType, data: fileData } },
        { type: 'text', text: message || 'حلّل هذه الصورة' }
      ]});
    } else {
      msgs.push({ role: 'user', content: message });
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: PROMPTS[botId] + DETAIL_INSTRUCTION,
      messages: msgs
    });

    const replyText = response.content[0]?.text || 'حاول مجدداً.';

    // إنشاء ملف Word إذا طُلب
    let wordFile = null;
    let wordFileName = null;

    if (needsWordFile(message)) {
      try {
        const info = BOT_INFO[botId] || { emoji:'🤖', name:botId };
        const title = message.slice(0, 60).replace(/[^\u0600-\u06FF\u0750-\u077F\s\w]/g, '').trim() || 'معلومات شاملة';
        wordFile = await generateWordFile(title, replyText, info.name, info.emoji);
        wordFileName = `${info.name}-${Date.now()}.docx`;
      } catch(e) {
        console.error('Word generation error:', e);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        reply: replyText,
        remainingMessages: check.remaining,
        ...(wordFile ? { wordFile, wordFileName } : {})
      })
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ error: 'حدث خطأ، حاول مجدداً' })
    };
  }
};
