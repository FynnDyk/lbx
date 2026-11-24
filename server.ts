import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.resolve(__dirname, 'public', 'models');
const ALLOWED_EXTS = new Set(['.glb', '.gltf', '.obj', '.fbx', '.stl', '.dae']);
const TEXTURE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tga', '.bmp', '.mtl']);
const ALLOWED_CHARS = new Set(['achilles', 'hunter', 'kunoichi', 'emperor', 'odin']);

interface StoredTextureMeta {
  name: string;
  url: string;
  size: number;
}

interface StoredWeaponMeta {
  filename: string;
  ext: string;
  size: number;
  url: string;
  yawOffsetDeg?: number;
  textures?: StoredTextureMeta[];
}

interface StoredModelMeta {
  characterId: string;
  filename: string;
  ext: string;
  size: number;
  uploadedAt: string;
  url: string;
  yawOffsetDeg?: number;
  playAnimation?: boolean;
  weaponMode?: 'auto' | 'builtin' | 'detached';
  textures?: StoredTextureMeta[];
  customWeapon?: StoredWeaponMeta;
}

function sanitizeCharId(raw: unknown): string {
  const s = String(raw || 'achilles').toLowerCase().trim();
  return ALLOWED_CHARS.has(s) ? s : 'achilles';
}

function metaPathFor(charId: string): string {
  return path.join(MODELS_DIR, `${charId}_meta.json`);
}

function texturesDirFor(charId: string): string {
  return path.join(MODELS_DIR, `${charId}_textures`);
}

function weaponTexturesDirFor(charId: string): string {
  return path.join(MODELS_DIR, `${charId}_weapon_textures`);
}

function ensureModelsDir() {
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }
}

function clearPreviousWeapon(charId: string) {
  ensureModelsDir();
  const weaponPrefix = `${charId}_weapon.`;
  for (const entry of fs.readdirSync(MODELS_DIR)) {
    if (entry.startsWith(weaponPrefix)) {
      fs.unlinkSync(path.join(MODELS_DIR, entry));
    }
  }
  const wTexDir = weaponTexturesDirFor(charId);
  if (fs.existsSync(wTexDir)) {
    fs.rmSync(wTexDir, { recursive: true, force: true });
  }
}

function clearPreviousModels(charId: string) {
  ensureModelsDir();
  const customPrefix = `${charId}_custom`;
  const metaName = `${charId}_meta.json`;
  for (const entry of fs.readdirSync(MODELS_DIR)) {
    if (entry.startsWith(customPrefix) || entry === metaName) {
      fs.unlinkSync(path.join(MODELS_DIR, entry));
    }
  }
  const texDir = texturesDirFor(charId);
  if (fs.existsSync(texDir)) {
    fs.rmSync(texDir, { recursive: true, force: true });
  }
  clearPreviousWeapon(charId);
}

function readStoredMeta(charId: string): (StoredModelMeta & { exists: true }) | null {
  const mPath = metaPathFor(charId);
  if (!fs.existsSync(mPath)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(mPath, 'utf-8')) as StoredModelMeta;
    const filePath = path.join(MODELS_DIR, `${charId}_custom${meta.ext}`);
    if (!fs.existsSync(filePath)) return null;
    return { exists: true, ...meta, characterId: meta.characterId || charId };
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  ensureModelsDir();

  // Serve saved models statically at /models
  app.use('/models', express.static(MODELS_DIR));

  // Get all saved custom models across characters
  app.get('/api/custom-models', (_req, res) => {
    try {
      const models: Record<string, StoredModelMeta> = {};
      for (const charId of ALLOWED_CHARS) {
        const meta = readStoredMeta(charId);
        if (meta) {
          models[charId] = meta;
        }
      }
      res.json({ models });
    } catch (err) {
      res.status(500).json({ models: {}, error: String(err) });
    }
  });

  // Get saved custom model metadata for a specific character (defaults to achilles)
  app.get('/api/custom-model', (req, res) => {
    try {
      const charId = sanitizeCharId(req.query.characterId);
      const meta = readStoredMeta(charId);
      if (!meta) {
        res.json({ exists: false, characterId: charId });
        return;
      }
      res.json(meta);
    } catch (err) {
      res.status(500).json({ exists: false, error: String(err) });
    }
  });

  // Upload and persist custom 3D model to disk for a character
  app.post(
    '/api/custom-model',
    express.raw({ type: '*/*', limit: '60mb' }),
    (req, res) => {
      try {
        const charId = sanitizeCharId(req.query.characterId);
        const rawName = String(req.query.filename || `${charId}.glb`);
        const safeName = path.basename(rawName);
        const ext = path.extname(safeName).toLowerCase();

        if (!ALLOWED_EXTS.has(ext)) {
          res.status(400).json({
            ok: false,
            error: 'Поддерживаются форматы .glb, .gltf, .fbx, .dae, .obj, .stl',
          });
          return;
        }

        const body = req.body as Buffer;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          res.status(400).json({ ok: false, error: 'Пустой файл модели' });
          return;
        }

        clearPreviousModels(charId);

        const targetFile = `${charId}_custom${ext}`;
        const targetPath = path.join(MODELS_DIR, targetFile);
        fs.writeFileSync(targetPath, body);

        const meta: StoredModelMeta = {
          characterId: charId,
          filename: safeName,
          ext,
          size: body.length,
          uploadedAt: new Date().toISOString(),
          url: `/models/${targetFile}`,
          yawOffsetDeg: 0,
          playAnimation: false,
          weaponMode: 'auto',
          textures: [],
        };
        fs.writeFileSync(metaPathFor(charId), JSON.stringify(meta, null, 2), 'utf-8');

        res.json({ ok: true, ...meta });
      } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
      }
    },
  );

  // Upload and attach a companion texture / material file (.png, .jpg, .tga, .mtl) to a character's custom model
  app.post(
    '/api/custom-model-texture',
    express.raw({ type: '*/*', limit: '25mb' }),
    (req, res) => {
      try {
        const charId = sanitizeCharId(req.query.characterId);
        const mPath = metaPathFor(charId);
        if (!fs.existsSync(mPath)) {
          res.status(404).json({ ok: false, error: 'Сначала загрузите 3D-модель' });
          return;
        }

        const rawName = String(req.query.filename || 'texture.png');
        const safeName = path.basename(rawName);
        const ext = path.extname(safeName).toLowerCase();
        if (!TEXTURE_EXTS.has(ext)) {
          res.status(400).json({ ok: false, error: 'Неподдерживаемый формат текстуры' });
          return;
        }

        const body = req.body as Buffer;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          res.status(400).json({ ok: false, error: 'Пустой файл текстуры' });
          return;
        }

        const texDir = texturesDirFor(charId);
        if (!fs.existsSync(texDir)) {
          fs.mkdirSync(texDir, { recursive: true });
        }
        fs.writeFileSync(path.join(texDir, safeName), body);

        const meta = JSON.parse(fs.readFileSync(mPath, 'utf-8')) as StoredModelMeta;
        const entry: StoredTextureMeta = {
          name: safeName,
          url: `/models/${charId}_textures/${encodeURIComponent(safeName)}`,
          size: body.length,
        };
        const existing = (meta.textures ?? []).filter(
          (t) => t.name.toLowerCase() !== safeName.toLowerCase(),
        );
        existing.push(entry);
        meta.textures = existing;
        fs.writeFileSync(mPath, JSON.stringify(meta, null, 2), 'utf-8');

        res.json({ ok: true, textures: meta.textures });
      } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
      }
    },
  );

  // Update orientation/animation/weapon offset for a character's custom model
  app.patch('/api/custom-model', express.json(), (req, res) => {
    try {
      const charId = sanitizeCharId(req.query.characterId ?? req.body?.characterId);
      const mPath = metaPathFor(charId);
      if (!fs.existsSync(mPath)) {
        res.status(404).json({ ok: false });
        return;
      }
      const meta = JSON.parse(fs.readFileSync(mPath, 'utf-8')) as StoredModelMeta;
      let changed = false;
      if (typeof req.body?.yawOffsetDeg === 'number') {
        meta.yawOffsetDeg = req.body.yawOffsetDeg;
        changed = true;
      }
      if (typeof req.body?.playAnimation === 'boolean') {
        meta.playAnimation = req.body.playAnimation;
        changed = true;
      }
      if (
        req.body?.weaponMode === 'auto' ||
        req.body?.weaponMode === 'builtin' ||
        req.body?.weaponMode === 'detached'
      ) {
        meta.weaponMode = req.body.weaponMode;
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(mPath, JSON.stringify(meta, null, 2), 'utf-8');
      }
      res.json({ ok: true, ...meta });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // Delete saved custom model for a character
  app.delete('/api/custom-model', (req, res) => {
    try {
      const charId = sanitizeCharId(req.query.characterId);
      clearPreviousModels(charId);
      res.json({ ok: true, characterId: charId });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // Upload and attach a separate 3D weapon model (e.g. Hunter's rifle) for a character
  app.post(
    '/api/custom-weapon',
    express.raw({ type: '*/*', limit: '60mb' }),
    (req, res) => {
      try {
        const charId = sanitizeCharId(req.query.characterId);
        const mPath = metaPathFor(charId);
        if (!fs.existsSync(mPath)) {
          res.status(404).json({ ok: false, error: 'Сначала загрузите 3D-модель персонажа' });
          return;
        }

        const rawName = String(req.query.filename || `${charId}_weapon.glb`);
        const safeName = path.basename(rawName);
        const ext = path.extname(safeName).toLowerCase();
        if (!ALLOWED_EXTS.has(ext)) {
          res.status(400).json({
            ok: false,
            error: 'Поддерживаются форматы .glb, .gltf, .fbx, .dae, .obj, .stl',
          });
          return;
        }

        const body = req.body as Buffer;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          res.status(400).json({ ok: false, error: 'Пустой файл оружия' });
          return;
        }

        clearPreviousWeapon(charId);

        const targetFile = `${charId}_weapon${ext}`;
        fs.writeFileSync(path.join(MODELS_DIR, targetFile), body);

        const meta = JSON.parse(fs.readFileSync(mPath, 'utf-8')) as StoredModelMeta;
        meta.customWeapon = {
          filename: safeName,
          ext,
          size: body.length,
          url: `/models/${targetFile}`,
          yawOffsetDeg: 0,
          textures: [],
        };
        fs.writeFileSync(mPath, JSON.stringify(meta, null, 2), 'utf-8');

        res.json({ ok: true, customWeapon: meta.customWeapon });
      } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
      }
    },
  );

  // Attach a companion texture to a character's custom weapon model
  app.post(
    '/api/custom-weapon-texture',
    express.raw({ type: '*/*', limit: '25mb' }),
    (req, res) => {
      try {
        const charId = sanitizeCharId(req.query.characterId);
        const mPath = metaPathFor(charId);
        if (!fs.existsSync(mPath)) {
          res.status(404).json({ ok: false, error: 'Сначала загрузите модель' });
          return;
        }
        const meta = JSON.parse(fs.readFileSync(mPath, 'utf-8')) as StoredModelMeta;
        if (!meta.customWeapon) {
          res.status(404).json({ ok: false, error: 'Сначала загрузите модель оружия' });
          return;
        }

        const rawName = String(req.query.filename || 'texture.png');
        const safeName = path.basename(rawName);
        const ext = path.extname(safeName).toLowerCase();
        if (!TEXTURE_EXTS.has(ext)) {
          res.status(400).json({ ok: false, error: 'Неподдерживаемый формат текстуры' });
          return;
        }

        const body = req.body as Buffer;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          res.status(400).json({ ok: false, error: 'Пустой файл текстуры' });
          return;
        }

        const wTexDir = weaponTexturesDirFor(charId);
        if (!fs.existsSync(wTexDir)) {
          fs.mkdirSync(wTexDir, { recursive: true });
        }
        fs.writeFileSync(path.join(wTexDir, safeName), body);

        const entry: StoredTextureMeta = {
          name: safeName,
          url: `/models/${charId}_weapon_textures/${encodeURIComponent(safeName)}`,
          size: body.length,
        };
        const existing = (meta.customWeapon.textures ?? []).filter(
          (t) => t.name.toLowerCase() !== safeName.toLowerCase(),
        );
        existing.push(entry);
        meta.customWeapon.textures = existing;
        fs.writeFileSync(mPath, JSON.stringify(meta, null, 2), 'utf-8');

        res.json({ ok: true, textures: meta.customWeapon.textures });
      } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
      }
    },
  );

  // Update orientation for a character's custom weapon model
  app.patch('/api/custom-weapon', express.json(), (req, res) => {
    try {
      const charId = sanitizeCharId(req.query.characterId ?? req.body?.characterId);
      const mPath = metaPathFor(charId);
      if (!fs.existsSync(mPath)) {
        res.status(404).json({ ok: false });
        return;
      }
      const meta = JSON.parse(fs.readFileSync(mPath, 'utf-8')) as StoredModelMeta;
      if (!meta.customWeapon) {
        res.status(404).json({ ok: false });
        return;
      }
      if (typeof req.body?.yawOffsetDeg === 'number') {
        meta.customWeapon.yawOffsetDeg = req.body.yawOffsetDeg;
        fs.writeFileSync(mPath, JSON.stringify(meta, null, 2), 'utf-8');
      }
      res.json({ ok: true, customWeapon: meta.customWeapon });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // Delete saved custom weapon model for a character
  app.delete('/api/custom-weapon', (req, res) => {
    try {
      const charId = sanitizeCharId(req.query.characterId);
      clearPreviousWeapon(charId);
      const mPath = metaPathFor(charId);
      if (fs.existsSync(mPath)) {
        const meta = JSON.parse(fs.readFileSync(mPath, 'utf-8')) as StoredModelMeta;
        delete meta.customWeapon;
        fs.writeFileSync(mPath, JSON.stringify(meta, null, 2), 'utf-8');
      }
      res.json({ ok: true, characterId: charId });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`LBX server running on http://0.0.0.0:${port}`);
  });
}

startServer();
