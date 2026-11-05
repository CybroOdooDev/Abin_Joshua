/** @odoo-module **/

const STORAGE_KEY = "pos_decor_saved_images";
const DELETED_KEY = "pos_decor_deleted_signatures";

export function getImageSignature(customImage) {
    if (!customImage || typeof customImage !== "string") return "";
    const len = customImage.length;
    return `${len}_${customImage.substring(0, 40)}_${customImage.substring(Math.max(0, len - 40))}`;
}

export function getLocalSavedImages() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function setLocalSavedImages(images) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(images || []));
    } catch (e) {
        console.warn("Could not save decor images to localStorage:", e);
    }
}

export function getDeletedSignatures() {
    try {
        const raw = localStorage.getItem(DELETED_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function markSignatureDeleted(sig) {
    if (!sig) return;
    try {
        const deleted = getDeletedSignatures();
        if (!deleted.includes(sig)) {
            deleted.push(sig);
            localStorage.setItem(DELETED_KEY, JSON.stringify(deleted));
        }
    } catch (e) {
        console.warn("Could not record deleted signature:", e);
    }
}

export function unmarkSignatureDeleted(sig) {
    if (!sig) return;
    try {
        const deleted = getDeletedSignatures().filter((s) => s !== sig);
        localStorage.setItem(DELETED_KEY, JSON.stringify(deleted));
    } catch (e) {
        console.warn("Could not unmark deleted signature:", e);
    }
}

export async function fetchAllSavedDecorImages(orm, pos) {
    const deletedSigs = new Set(getDeletedSignatures());
    const candidates = [];

    // 1. From localStorage
    const local = getLocalSavedImages();
    for (const item of local) {
        if (item && item.custom_image) {
            candidates.push(item);
        }
    }

    // 2. From currently loaded POS tables in memory
    if (pos && pos.tables_by_id) {
        for (const t of Object.values(pos.tables_by_id)) {
            if (t && t.custom_image) {
                candidates.push({
                    id: t.id,
                    name: t.name || "Custom Table Graphic",
                    custom_image: t.custom_image,
                    is_decoration: Boolean(t.is_decoration),
                    seats: t.seats || 0,
                    table_type: t.table_type || "table",
                });
            }
        }
    }

    // 3. From standard restaurant.table searchRead (including archived / previous tables)
    if (orm) {
        try {
            const dbTables = await orm.searchRead(
                "restaurant.table",
                [["custom_image", "!=", false]],
                ["id", "name", "custom_image", "table_type", "is_decoration", "seats"],
                { context: { active_test: false }, order: "id desc" }
            );
            if (Array.isArray(dbTables)) {
                for (const t of dbTables) {
                    if (t.custom_image) {
                        candidates.push({
                            id: t.id,
                            name: t.name || "Custom Floor Decor",
                            custom_image: t.custom_image,
                            is_decoration: Boolean(t.is_decoration),
                            seats: t.seats || 0,
                            table_type: t.table_type || "table",
                        });
                    }
                }
            }
        } catch (e) {
            console.warn("Could not query restaurant.table for decor images:", e);
        }

        // 4. Try backend Python method if server has been restarted
        if (pos && pos.pos_session) {
            try {
                const pyImages = await orm.call(
                    "pos.session",
                    "get_saved_decor_images",
                    [pos.pos_session.id]
                );
                if (Array.isArray(pyImages)) {
                    for (const img of pyImages) {
                        if (img.custom_image) {
                            candidates.push(img);
                        }
                    }
                }
            } catch {
                // Ignored if Python method not yet loaded by host server
            }
        }
    }

    // Deduplicate and filter out explicitly deleted signatures
    const unique = [];
    const seen = new Set();

    for (const item of candidates) {
        const sig = getImageSignature(item.custom_image);
        if (!sig || deletedSigs.has(sig) || seen.has(sig)) {
            continue;
        }
        seen.add(sig);
        unique.push(item);
    }

    // Update localStorage cache with full consolidated list
    setLocalSavedImages(unique);
    return unique;
}

export function saveDecorImageLocally(item) {
    if (!item || !item.custom_image) return;
    const sig = getImageSignature(item.custom_image);
    unmarkSignatureDeleted(sig);

    const existing = getLocalSavedImages();
    const filtered = existing.filter((ex) => getImageSignature(ex.custom_image) !== sig);
    filtered.unshift(item);
    setLocalSavedImages(filtered);
}

export function removeDecorImageLocally(item) {
    if (!item || !item.custom_image) return;
    const sig = getImageSignature(item.custom_image);
    markSignatureDeleted(sig);

    const existing = getLocalSavedImages();
    const filtered = existing.filter((ex) => getImageSignature(ex.custom_image) !== sig);
    setLocalSavedImages(filtered);
}

