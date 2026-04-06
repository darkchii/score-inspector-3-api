const express = require('express');
const { AltBeatmapLive, InspectorBeatmapMedia, InspectorUserRole, InspectorRole } = require('../helpers/db');
const { GetOwnData } = require('../helpers/osuApiHelper');

const router = express.Router();

const EDITOR_ROLE_ID = 5;
const MAX_RESULT_LIMIT = 100;
const MEDIA_FIELDS = [
    { key: 'youtube', label: 'YouTube', column: 'youtube_id' },
    { key: 'spotify', label: 'Spotify', column: 'spotify_id' },
];

async function hasEditorAccess(userId) {
    const userRoles = await InspectorUserRole.findAll({
        where: { user_id: userId },
        include: [InspectorRole]
    });

    if (!userRoles || userRoles.length === 0) {
        return false;
    }

    return userRoles.some((entry) => {
        const role = entry.inspectorRole || {};
        const title = (role.title || '').toString().toLowerCase();
        return entry.role_id === EDITOR_ROLE_ID || title === 'editor' || role.is_editor === true || role.is_admin === true;
    });
}

function normalizeMediaValue(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }

    return value;
}

function getAuditFilters() {
    return [
        { key: 'incomplete', label: 'Missing Any Media' },
        { key: 'missing-entry', label: 'No Media Entry' },
        ...MEDIA_FIELDS.map((field) => ({
            key: field.key,
            label: `Missing ${field.label}`
        }))
    ];
}

function createAuditRow(beatmapset, media) {
    const mediaValues = {};
    const presentMediaKeys = [];
    const missingMediaKeys = [];

    MEDIA_FIELDS.forEach((field) => {
        const normalizedValue = normalizeMediaValue(media ? media[field.column] : null);
        mediaValues[field.key] = normalizedValue;

        if (normalizedValue) {
            presentMediaKeys.push(field.key);
        } else {
            missingMediaKeys.push(field.key);
        }
    });

    return {
        beatmapset_id: beatmapset.beatmapset_id,
        title: beatmapset.title,
        artist: beatmapset.artist,
        mapper: beatmapset.mapper,
        mapper_id: beatmapset.mapper_id,
        ranked_raw: beatmapset.ranked_raw,
        beatmap_count: beatmapset.beatmap_count,
        has_media_entry: !!media,
        present_media_keys: presentMediaKeys,
        missing_media_keys: missingMediaKeys,
        media_values: mediaValues,
    };
}

function matchesFilter(row, filterKey) {
    if (filterKey === 'incomplete') {
        return row.missing_media_keys.length > 0;
    }

    if (filterKey === 'missing-entry') {
        return row.has_media_entry === false;
    }

    return row.missing_media_keys.includes(filterKey);
}

function sortAuditRows(a, b) {
    if (b.missing_media_keys.length !== a.missing_media_keys.length) {
        return b.missing_media_keys.length - a.missing_media_keys.length;
    }

    if (a.has_media_entry !== b.has_media_entry) {
        return Number(a.has_media_entry) - Number(b.has_media_entry);
    }

    return a.beatmapset_id - b.beatmapset_id;
}

router.post('/beatmap-media-audit', async (req, res) => {
    const { access_token, limit } = req.body || {};

    if (!access_token || typeof access_token !== 'string') {
        return res.status(401).json({ error: 'Access token is required' });
    }

    let oauthUser = null;
    try {
        oauthUser = await GetOwnData(access_token);
    } catch (error) {
        console.error('Failed to validate access token for admin media audit:', error);
        return res.status(401).json({ error: 'Invalid access token' });
    }

    if (!oauthUser || !oauthUser.id) {
        return res.status(401).json({ error: 'Invalid user data from access token' });
    }

    try {
        const editorAccess = await hasEditorAccess(oauthUser.id);
        if (!editorAccess) {
            return res.status(403).json({ error: 'Editor role is required' });
        }

        const requestedLimit = parseInt(limit, 10);
        const parsedLimit = Math.min(
            MAX_RESULT_LIMIT,
            Math.max(Number.isNaN(requestedLimit) ? MAX_RESULT_LIMIT : requestedLimit, 1)
        );

        const [beatmapRows, mediaRows] = await Promise.all([
            AltBeatmapLive.findAll({
                attributes: ['beatmapset_id', 'title', 'artist', 'mapper', 'mapper_id', 'ranked_raw', 'last_updated'],
                order: [['beatmapset_id', 'ASC'], ['last_updated', 'DESC']],
                raw: true,
            }),
            InspectorBeatmapMedia.findAll({
                attributes: ['beatmapset_id', ...MEDIA_FIELDS.map((field) => field.column)],
                raw: true,
            })
        ]);

        const beatmapsetMap = new Map();
        beatmapRows.forEach((row) => {
            if (!row.beatmapset_id) {
                return;
            }

            const existing = beatmapsetMap.get(row.beatmapset_id);
            if (existing) {
                existing.beatmap_count += 1;
                return;
            }

            beatmapsetMap.set(row.beatmapset_id, {
                beatmapset_id: row.beatmapset_id,
                title: row.title,
                artist: row.artist,
                mapper: row.mapper,
                mapper_id: row.mapper_id,
                ranked_raw: row.ranked_raw,
                beatmap_count: 1,
            });
        });

        const mediaMap = new Map();
        mediaRows.forEach((row) => {
            mediaMap.set(row.beatmapset_id, row);
        });

        const auditRows = Array.from(beatmapsetMap.values())
            .map((beatmapset) => createAuditRow(beatmapset, mediaMap.get(beatmapset.beatmapset_id) || null))
            .filter((row) => row.missing_media_keys.length > 0)
            .sort(sortAuditRows);

        const filters = getAuditFilters().map((filter) => ({
            ...filter,
            count: auditRows.filter((row) => matchesFilter(row, filter.key)).length,
        }));

        const rowsByFilter = {};
        filters.forEach((filter) => {
            rowsByFilter[filter.key] = auditRows
                .filter((row) => matchesFilter(row, filter.key))
                .slice(0, parsedLimit);
        });

        return res.status(200).json({
            limit: parsedLimit,
            media_fields: MEDIA_FIELDS,
            filters,
            rows_by_filter: rowsByFilter,
        });
    } catch (error) {
        console.error('Error building beatmap media audit:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;