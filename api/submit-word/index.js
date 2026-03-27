const https = require('https');

// ── Constants ──
const REPO_OWNER  = 'zanderxxx';
const REPO_NAME   = 'marketing-glossary';
const FILE_PATH   = 'data/glossary.json';
const ALLOWED_ORIGIN = 'https://zanderxxx.github.io';

const VALID_CATS = ['通用', 'Social', '3C 数码', '小红书', '抖音', '直播', 'NEW'];

const SPAM_KEYWORDS = [
  'http://', 'https://', 'www.', '.com', '.cn', '.net', '.org',
  'QQ', '微信号', 'WeChat', '加我', '联系我', '电话', '手机号',
  'free', '免费领', '折扣', '优惠码', '促销', '广告',
];

// ── Rule-based validation ──
function validate(body) {
  const errors = [];

  // 1. Required fields
  for (const field of ['cn', 'en', 'cat', 'def', 'ex', 'contributor']) {
    if (!body[field] || String(body[field]).trim() === '') {
      errors.push(`字段 ${field} 不能为空`);
    }
  }
  if (errors.length) return { ok: false, errors };

  const { cn, en, cat, def, ex, contributor } = body;

  // 2. Field length limits (removed)

  // 3. Valid category
  if (!VALID_CATS.includes(cat)) {
    errors.push(`无效分类：${cat}`);
  }

  // 4. Spam check
  const allText = [cn, en, def, ex, contributor].join(' ');
  for (const kw of SPAM_KEYWORDS) {
    if (allText.toLowerCase().includes(kw.toLowerCase())) {
      errors.push(`包含不允许的内容：${kw}`);
      break;
    }
  }

  // 5. Meaningfulness: def must have some CJK or Latin content
  const cjkCount   = (def.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinCount  = (def.match(/[a-zA-Z]{2,}/g) || []).length;
  if (cjkCount < 4 && latinCount < 3) {
    errors.push('定义内容不够完整，请补充说明');
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

// ── GitHub API helper ──
function githubRequest(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.github.com',
        path,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'marketing-glossary-bot/1.0',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Main handler ──
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: '只支持 POST 请求' });

  // Parse body
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object') throw new Error();
  } catch {
    return res.status(400).json({ error: '无效的请求格式' });
  }

  // Trim all string fields
  for (const key of Object.keys(body)) {
    if (typeof body[key] === 'string') body[key] = body[key].trim();
  }

  // Validate
  const validation = validate(body);
  if (!validation.ok) {
    return res.status(422).json({ error: '提交未通过审核', details: validation.errors });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: '服务配置错误' });

  try {
    // 1. Fetch current glossary.json (need SHA for update)
    const getRes = await githubRequest(
      'GET',
      `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      token
    );
    if (getRes.status !== 200) {
      throw new Error(`无法获取词库文件 (${getRes.status})`);
    }

    const fileSha = getRes.body.sha;
    const current = JSON.parse(
      Buffer.from(getRes.body.content, 'base64').toString('utf8')
    );

    // 2. Deduplicate
    const cnLow = body.cn.toLowerCase();
    const enLow = body.en.toLowerCase();
    const dup = current.terms.some(
      (t) => t.cn.toLowerCase() === cnLow || t.en.toLowerCase() === enLow
    );
    if (dup) return res.status(409).json({ error: '该词汇已存在于词库中' });

    // 3. Assign ID (max + 1, min 1001)
    const maxId  = current.terms.reduce((m, t) => Math.max(m, t.id || 0), 1000);
    const newId  = Math.max(maxId + 1, 1001);
    const today  = new Date().toISOString().slice(0, 10);

    const newTerm = {
      id: newId,
      cn: body.cn,
      en: body.en,
      cat: body.cat,
      def: body.def,
      ex: body.ex,
      contributor: body.contributor,
      addedAt: today,
    };

    current.terms.push(newTerm);

    // 4. Commit updated glossary.json
    const newContent = Buffer.from(
      JSON.stringify(current, null, 2)
    ).toString('base64');

    const putRes = await githubRequest(
      'PUT',
      `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      token,
      {
        message: `feat: add "${newTerm.cn}" (${newTerm.en}) — contributed by ${newTerm.contributor}`,
        content: newContent,
        sha: fileSha,
        committer: { name: 'Glossary Bot', email: 'bot@noreply.github.com' },
      }
    );

    if (putRes.status !== 200 && putRes.status !== 201) {
      // SHA conflict from concurrent submission
      if (putRes.status === 409 || putRes.status === 422) {
        return res.status(503).json({ error: '提交冲突，请稍后重试', retry: true });
      }
      throw new Error(`GitHub commit failed: ${putRes.status}`);
    }

    return res.status(200).json({ ok: true, id: newId, term: newTerm });

  } catch (err) {
    console.error('Submission error:', err);
    return res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
};
