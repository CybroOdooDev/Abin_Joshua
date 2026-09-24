/** @odoo-module **/

/**
 * kiosk_storage.js
 *
 * Abstracts all theme/element-style persistence.
 * - PRIMARY store  : Odoo ir.config_parameter (server-side, cross-browser)
 * - FALLBACK store : localStorage (offline / before first server round-trip)
 *
 * Keys used in ir.config_parameter:
 *   pos_kiosk_studio.theme          → JSON of global theme colours
 *   pos_kiosk_studio.element_styles → JSON of per-element overrides
 *   pos_kiosk_studio.bg_filename    → plain string
 */

const SERVER_KEYS = {
    theme:         "pos_kiosk_studio.theme",
    elementStyles: "pos_kiosk_studio.element_styles",
    bgFilename:    "pos_kiosk_studio.bg_filename",
    bgAttachmentId: "pos_kiosk_studio.bg_attachment_id",  // stores ir.attachment id
};

const LOCAL_KEYS = {
    theme:         "kiosk_theme",
    elementStyles: "kiosk_element_styles",
    bgFilename:    "kiosk_bg_filename",
};

/* ── localStorage helpers (Safari private mode safe) ── */
function lsGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* quota / security */ }
}
function lsRemove(key) {
    try { localStorage.removeItem(key); } catch { /* noop */ }
}
function safeParse(str, fallback) {
    try { return JSON.parse(str) || fallback; } catch { return fallback; }
}

/* ── Odoo JSON-RPC helpers ── */
async function rpcCall(model, method, args = [], kwargs = {}) {
    const response = await fetch("/web/dataset/call_kw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
            jsonrpc: "2.0",
            method:  "call",
            id:      Date.now(),
            params: {
                model,
                method,
                args,
                kwargs: { context: {}, ...kwargs },
            },
        }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (json.error) throw new Error(json.error.data?.message || json.error.message);
    return json.result;
}

async function serverGet(key) {
    try {
        const ids = await rpcCall("ir.config_parameter", "search", [
            [["key", "=", key]],
        ]);
        if (!ids || !ids.length) return null;
        const records = await rpcCall("ir.config_parameter", "read", [ids, ["value"]]);
        return records[0]?.value ?? null;
    } catch (e) {
        console.warn("[KioskStorage] serverGet failed:", e.message);
        return null;
    }
}

/**
 * Write (create or update) one ir.config_parameter.
 */
async function serverSet(key, value) {
    try {
        await rpcCall("ir.config_parameter", "set_param", [key, value]);
    } catch (e) {
        console.warn("[KioskStorage] serverSet failed:", e.message);
    }
}

/**
 * Delete one ir.config_parameter.
 */
async function serverDelete(key) {
    try {
        const ids = await rpcCall("ir.config_parameter", "search", [
            [["key", "=", key]],
        ]);
        if (ids && ids.length) {
            await rpcCall("ir.config_parameter", "unlink", [ids]);
        }
    } catch (e) {
        console.warn("[KioskStorage] serverDelete failed:", e.message);
    }
}

export async function loadKioskSettings() {
    let theme         = null;
    let elementStyles = null;
    let bgFilename    = null;
    let bgImage       = null;

    try {
        const [rawTheme, rawStyles, rawBg] = await Promise.all([
            serverGet(SERVER_KEYS.theme),
            serverGet(SERVER_KEYS.elementStyles),
            serverGet(SERVER_KEYS.bgFilename),
        ]);

        theme         = rawTheme  ? safeParse(rawTheme,  null) : null;
        elementStyles = rawStyles ? safeParse(rawStyles, null) : null;
        bgFilename    = rawBg     || null;

        /* Warm up localStorage cache */
        if (rawTheme)  lsSet(LOCAL_KEYS.theme,         rawTheme);
        if (rawStyles) lsSet(LOCAL_KEYS.elementStyles,  rawStyles);
        if (rawBg)     lsSet(LOCAL_KEYS.bgFilename,     rawBg);

        /* Load background image from ir.attachment */
        bgImage = await loadImageFromServer();
    } catch {
        /* Server unreachable — use cached localStorage values */
        theme         = safeParse(lsGet(LOCAL_KEYS.theme),         null);
        elementStyles = safeParse(lsGet(LOCAL_KEYS.elementStyles), null);
        bgFilename    = lsGet(LOCAL_KEYS.bgFilename);
        /* bgImage stays null — IndexedDB caller handles its own fallback */
    }

    return { theme, elementStyles, bgFilename, bgImage };
}

export async function saveImageToServer(base64DataUrl, filename) {
    if (!base64DataUrl) return;
    /* Strip the "data:<mime>;base64," prefix — Odoo wants raw base64 */
    const commaIdx  = base64DataUrl.indexOf(",");
    const mimeMatch = base64DataUrl.match(/^data:([^;]+);base64,/);
    const mimetype  = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const raw = commaIdx !== -1 ? base64DataUrl.slice(commaIdx + 1) : base64DataUrl;

    try {
        const prevIdStr = await serverGet(SERVER_KEYS.bgAttachmentId);
        if (prevIdStr) {
            const prevId = parseInt(prevIdStr, 10);
            if (!isNaN(prevId)) {
                await rpcCall("ir.attachment", "unlink", [[prevId]]).catch(() => {});
            }
        }
        const attachmentId = await rpcCall("ir.attachment", "create", [{
            name:      filename || ATTACHMENT_NAME,
            type:      "binary",
            datas:     raw,
            mimetype:  mimetype,
            res_model: "pos.config",
        }]);
        await serverSet(SERVER_KEYS.bgAttachmentId, String(attachmentId));

        /* Also persist the filename */
        if (filename) await saveBgFilename(filename);

    } catch (e) {
        console.warn("[KioskStorage] saveImageToServer failed:", e.message);
    }
}

export async function loadImageFromServer() {
    try {
        const idStr = await serverGet(SERVER_KEYS.bgAttachmentId);
        if (!idStr) return null;

        const attachmentId = parseInt(idStr, 10);
        if (isNaN(attachmentId)) return null;

        const records = await rpcCall("ir.attachment", "read", [
            [attachmentId],
            ["datas", "mimetype", "name"],
        ]);

        if (!records || !records.length || !records[0].datas) return null;

        const { datas, mimetype } = records[0];
        return `data:${mimetype || "image/jpeg"};base64,${datas}`;

    } catch (e) {
        console.warn("[KioskStorage] loadImageFromServer failed:", e.message);
        return null;
    }
}

export async function deleteImageFromServer() {
    try {
        const idStr = await serverGet(SERVER_KEYS.bgAttachmentId);
        if (idStr) {
            const attachmentId = parseInt(idStr, 10);
            if (!isNaN(attachmentId)) {
                await rpcCall("ir.attachment", "unlink", [[attachmentId]]).catch(() => {});
            }
        }
        await serverDelete(SERVER_KEYS.bgAttachmentId);
    } catch (e) {
        console.warn("[KioskStorage] deleteImageFromServer failed:", e.message);
    }
}

export async function saveTheme(themeObj) {
    const raw = JSON.stringify(themeObj);
    lsSet(LOCAL_KEYS.theme, raw);
    await serverSet(SERVER_KEYS.theme, raw);
}

export async function saveElementStyles(stylesObj) {
    const raw = JSON.stringify(stylesObj);
    lsSet(LOCAL_KEYS.elementStyles, raw);
    await serverSet(SERVER_KEYS.elementStyles, raw);
}

export async function saveBgFilename(name) {
    lsSet(LOCAL_KEYS.bgFilename, name);
    await serverSet(SERVER_KEYS.bgFilename, name);
}

export async function clearAllKioskSettings() {
    lsRemove(LOCAL_KEYS.theme);
    lsRemove(LOCAL_KEYS.elementStyles);
    lsRemove(LOCAL_KEYS.bgFilename);
    await Promise.all([
        serverDelete(SERVER_KEYS.theme),
        serverDelete(SERVER_KEYS.elementStyles),
        serverDelete(SERVER_KEYS.bgFilename),
        deleteImageFromServer(),
    ]);
}
export async function clearThemeOnly() {
    // Remove only theme-related data
    lsRemove(LOCAL_KEYS.theme);
    lsRemove(LOCAL_KEYS.bgFilename);

    await Promise.all([
        serverDelete(SERVER_KEYS.theme),
        serverDelete(SERVER_KEYS.bgFilename),
        deleteImageFromServer(),
    ]);
}