'use strict';

/**
 * LINE Rich Menu module for LINE Customer Service V2.9.20.
 *
 * Design goals:
 * - Keep all existing LINE customer-service logic untouched.
 * - No new npm dependency; uses Node's built-in fetch and existing sharp.
 * - Opt-in via RICH_MENU_ENABLED=true so the current deployment is unchanged until enabled.
 * - Reuse an existing menu when the image + configuration are unchanged.
 * - Create a new menu only when the effective content changes.
 * - Set the created/reused menu as the channel default.
 *
 * Official LINE flow: create rich menu -> upload image -> set default rich menu.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const LINE_API_BASE = 'https://api.line.me';
const LINE_DATA_API_BASE = 'https://api-data.line.me';

function envBool(name, defaultValue = false) {
  const raw = String(process.env[name] ?? '').trim();
  if (!raw) return defaultValue;
  return /^(1|true|yes|y|on|是)$/i.test(raw);
}

function requiredEnv(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getConfigPath() {
  return path.resolve(process.env.RICH_MENU_CONFIG_PATH || path.join(__dirname, 'richmenu.json'));
}

function getImagePath() {
  return path.resolve(process.env.RICH_MENU_IMAGE_PATH || path.join(__dirname, 'richmenu.png'));
}

async function apiRequest(baseUrl, pathname, { method = 'GET', body, contentType } = {}) {
  const token = requiredEnv('LINE_CHANNEL_ACCESS_TOKEN');
  const headers = { Authorization: `Bearer ${token}` };
  if (contentType) headers['Content-Type'] = contentType;
  if (body && !contentType) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data);
    const error = new Error(`LINE Rich Menu API ${method} ${pathname} failed (${response.status}): ${detail}`);
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return data;
}

function normaliseDefinition(definition) {
  if (!definition || typeof definition !== 'object') throw new Error('Rich Menu definition must be a JSON object.');
  const required = ['size', 'selected', 'name', 'chatBarText', 'areas'];
  for (const key of required) if (!(key in definition)) throw new Error(`Rich Menu definition missing required field: ${key}`);
  if (!definition.size || Number(definition.size.width) < 800 || Number(definition.size.width) > 2500 || Number(definition.size.height) < 250 || Number(definition.size.width) / Number(definition.size.height) < 1.45) {
    throw new Error('Rich Menu size must be within LINE requirements: width 800-2500, height >=250, aspect ratio >=1.45.');
  }
  if (!Array.isArray(definition.areas) || definition.areas.length === 0 || definition.areas.length > 20) throw new Error('Rich Menu areas must contain 1-20 items.');
  if (String(definition.name).length > 300) throw new Error('Rich Menu name must be <= 300 characters.');
  if (String(definition.chatBarText).length > 14) throw new Error('Rich Menu chatBarText must be <= 14 characters.');
  return {
    ...definition,
    size: { width: Number(definition.size.width), height: Number(definition.size.height) },
    selected: Boolean(definition.selected),
    name: String(definition.name),
    chatBarText: String(definition.chatBarText),
    areas: definition.areas,
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function loadAssets() {
  const configPath = getConfigPath();
  const imagePath = getImagePath();
  const definition = normaliseDefinition(JSON.parse(await fs.promises.readFile(configPath, 'utf8')));
  const imageBuffer = await fs.promises.readFile(imagePath);
  if (!imageBuffer.length) throw new Error(`Rich Menu image is empty: ${imagePath}`);
  if (imageBuffer.length > 1024 * 1024) throw new Error(`Rich Menu image exceeds LINE's 1 MB limit: ${imageBuffer.length} bytes.`);
  const metadata = await sharp(imageBuffer).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!['png', 'jpeg', 'jpg'].includes(String(metadata.format || '').toLowerCase())) throw new Error(`Rich Menu image must be PNG or JPEG; got ${metadata.format || 'unknown'}.`);
  if (width !== definition.size.width || height !== definition.size.height) {
    throw new Error(`Rich Menu image dimensions ${width}x${height} do not match config ${definition.size.width}x${definition.size.height}.`);
  }
  const hash = crypto.createHash('sha256').update(stableJson(definition)).update(imageBuffer).digest('hex').slice(0, 12);
  return { definition, imageBuffer, metadata, configPath, imagePath, hash };
}

async function validateRichMenu(definition) {
  await apiRequest(LINE_API_BASE, '/v2/bot/richmenu/validate', {
    method: 'POST',
    body: definition,
  });
}

async function listRichMenus() {
  const result = await apiRequest(LINE_API_BASE, '/v2/bot/richmenu/list');
  return Array.isArray(result?.richmenus) ? result.richmenus : [];
}

async function createRichMenu(definition) {
  const result = await apiRequest(LINE_API_BASE, '/v2/bot/richmenu', { method: 'POST', body: definition });
  if (!result?.richMenuId) throw new Error('LINE Rich Menu create succeeded but no richMenuId was returned.');
  return result.richMenuId;
}

async function uploadRichMenuImage(richMenuId, imageBuffer, metadata) {
  const format = String(metadata.format || '').toLowerCase();
  const contentType = format === 'png' ? 'image/png' : 'image/jpeg';
  await apiRequest(LINE_DATA_API_BASE, `/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`, {
    method: 'POST',
    body: imageBuffer,
    contentType,
  });
}

async function setDefaultRichMenu(richMenuId) {
  await apiRequest(LINE_API_BASE, `/v2/bot/user/all/richmenu/${encodeURIComponent(richMenuId)}`, { method: 'POST' });
}

async function getDefaultRichMenu() {
  try {
    return await apiRequest(LINE_API_BASE, '/v2/bot/user/all/richmenu');
  } catch (error) {
    console.warn('Rich Menu default lookup failed:', error.message);
    return null;
  }
}

/**
 * Create/reuse a default Rich Menu for the whole LINE Official Account.
 * The operation is intentionally idempotent for an unchanged image/configuration.
 */
async function setupRichMenu() {
  if (!envBool('RICH_MENU_ENABLED', false)) {
    return { enabled: false, action: 'disabled' };
  }

  const assets = await loadAssets();
  const versionedName = `${assets.definition.name} [${assets.hash}]`;
  const definition = { ...assets.definition, name: versionedName, selected: false };

  // Validate before any create call so a bad config cannot create a broken menu.
  await validateRichMenu(definition);

  const menus = await listRichMenus();
  let menu = menus.find(item => String(item?.name || '') === versionedName);

  let action = 'reused';
  if (!menu?.richMenuId) {
    const richMenuId = await createRichMenu(definition);
    await uploadRichMenuImage(richMenuId, assets.imageBuffer, assets.metadata);
    menu = { ...definition, richMenuId };
    action = 'created';
  }

  const currentDefault = await getDefaultRichMenu();
  if (currentDefault?.richMenuId !== menu.richMenuId) {
    await setDefaultRichMenu(menu.richMenuId);
    action += '+default-set';
  }

  console.log('Rich Menu ready', {
    action,
    richMenuId: menu.richMenuId,
    name: menu.name,
    image: path.relative(process.cwd(), assets.imagePath),
  });

  return { enabled: true, action, richMenuId: menu.richMenuId, name: menu.name };
}

module.exports = {
  setupRichMenu,
  loadRichMenuAssets: loadAssets,
  listRichMenus,
  getDefaultRichMenu,
};
