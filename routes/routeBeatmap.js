const express = require('express');
const { AltBeatmapLive, InspectorBeatmapMedia, AltScoreLive, InspectorUserRole, InspectorRole } = require('../helpers/db');
const router = express.Router();
const apicache = require('apicache-plus');
const routeCache = apicache.newInstance();
const cache = routeCache.middleware;
const { FetchBeatmapFile } = require('../helpers/diffCalcHelper');
const { GetTags, GetBeatmap, GetBeatmapset, GetBeatmapScores, GetOwnData } = require('../helpers/osuApiHelper');
const { Op } = require('@sequelize/core');
const { getFullUsers } = require('../helpers/userHelper');
const { OSU_SLUGS } = require('../helpers/osuHelper');
const { MEDIA_FIELD_DEFINITIONS, extractYoutubeId, extractSpotifyPath, getMediaFieldDefinition, normalizeMediaValueByKey } = require('../helpers/mediaHelper');

const BEATMAP_CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
const COMPACT_ATTRIBUTES = [
    'beatmap_id',
    'beatmapset_id',
    'version',
    'mode',
    'title',
    'artist',
    'ranked_raw',
    'checksum',
];

const BATCH_ATTRIBUTES = [
    'beatmap_id',
    'mapper_id',
    'beatmapset_id',
    'mode',
    'status',
    'stars',
    'od',
    'ar',
    'bpm',
    'cs',
    'hp',
    'length',
    'drain_time',
    'count_circles',
    'count_sliders',
    'count_spinners',
    'max_combo',
    'pass_count',
    'play_count',
    'fc_count',
    'ss_count',
    'favourite_count',
    'ranked_date',
    'submitted_date',
    'last_updated',
    'version',
    'title',
    'artist',
    'source',
    'tags',
    'checksum',
    'track_id',
    'pack',
    'lchg_time',
    'mapper',
    'is_nsfw',
    'beatmap_offset',
    'rating',
    'is_spotlight',
    'genre',
    'language',
    'has_video',
    'has_storyboard',
    'download_disabled',
    'mode_str',
    'is_convert',
    'current_user_playcount',
    'beatmap_deleted_at',
    'beatmap_is_scoreable',
    'ranked_raw',
    'url',
    'owners'
];

const BEATMAP_CACHE = {
    full: { data: null, updatedAt: null, refreshPromise: null },
    compact: { data: null, updatedAt: null, refreshPromise: null },
};

const TITLE_STOP_WORDS = new Set([
    'the',
    'a',
    'an',
    'and',
    'feat',
    'featuring',
    'ft',
    'ver',
    'version',
    'tv',
    'size',
    'cut',
    'mix',
    'edit',
    'remaster',
]);

function toInteger(value, fallbackValue) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function normalizeComparableText(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\[\](){}]/g, ' ')
        .replace(/\b(feat\.?|featuring|ft\.?)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizeComparableText(value) {
    const normalized = normalizeComparableText(value);
    if (!normalized) {
        return [];
    }

    return normalized
        .split(' ')
        .filter((token) => token.length > 0 && !TITLE_STOP_WORDS.has(token));
}

function getOverlapCount(leftTokens, rightTokens) {
    const rightSet = new Set(rightTokens);
    let overlap = 0;
    leftTokens.forEach((token) => {
        if (rightSet.has(token)) {
            overlap += 1;
        }
    });

    return overlap;
}

function getTextSimilarity(leftValue, rightValue) {
    const leftNormalized = normalizeComparableText(leftValue);
    const rightNormalized = normalizeComparableText(rightValue);
    if (!leftNormalized || !rightNormalized) {
        return 0;
    }

    if (leftNormalized === rightNormalized) {
        return 1;
    }

    const leftTokens = tokenizeComparableText(leftValue);
    const rightTokens = tokenizeComparableText(rightValue);
    if (leftTokens.length === 0 || rightTokens.length === 0) {
        return 0;
    }

    const overlap = getOverlapCount(leftTokens, rightTokens);
    if (overlap === 0) {
        return 0;
    }

    const unionSize = new Set([...leftTokens, ...rightTokens]).size;
    const jaccard = unionSize > 0 ? overlap / unionSize : 0;
    const containment = overlap / Math.min(leftTokens.length, rightTokens.length);

    return Math.max(jaccard, containment * 0.95);
}

function buildRecommendationFieldsFromRows(rows, recommendationLimit, sourceKey = null) {
    return MEDIA_FIELD_DEFINITIONS
        .filter((field) => field.key !== sourceKey)
        .map((field) => {
            const recommendations = new Map();

            rows.forEach((row) => {
                const rawValue = row[field.column];
                const normalizedValue = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
                if (!normalizedValue) {
                    return;
                }

                const existing = recommendations.get(normalizedValue) || {
                    value: normalizedValue,
                    match_count: 0,
                    beatmapset_ids: [],
                };

                existing.match_count += 1;
                if (!existing.beatmapset_ids.includes(row.beatmapset_id)) {
                    existing.beatmapset_ids.push(row.beatmapset_id);
                }

                recommendations.set(normalizedValue, existing);
            });

            return {
                key: field.key,
                label: field.label,
                recommendations: Array.from(recommendations.values())
                    .sort((left, right) => {
                        if (right.match_count !== left.match_count) {
                            return right.match_count - left.match_count;
                        }

                        return left.value.localeCompare(right.value);
                    })
                    .slice(0, recommendationLimit),
            };
        });
}

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
        return entry.role_id === 5 || title === 'editor' || role.is_editor === true || role.is_admin === true;
    });
}

const isCacheFresh = (entry) => (
    entry.data !== null
    && entry.updatedAt !== null
    && (Date.now() - entry.updatedAt < BEATMAP_CACHE_DURATION)
);

const refreshBeatmapCache = async (cacheKey) => {
    const cacheEntry = BEATMAP_CACHE[cacheKey];
    if (cacheEntry.refreshPromise) {
        return cacheEntry.refreshPromise;
    }

    const queryOptions = { raw: true };
    if (cacheKey === 'compact') {
        queryOptions.attributes = COMPACT_ATTRIBUTES;
    } else {
        queryOptions.attributes = BATCH_ATTRIBUTES; //adding ALL attributes generates too much data that we don't need
    }

    cacheEntry.refreshPromise = AltBeatmapLive.findAll(queryOptions)
        .then((beatmaps) => {
            cacheEntry.data = beatmaps;
            cacheEntry.updatedAt = Date.now();
            return beatmaps;
        })
        .finally(() => {
            cacheEntry.refreshPromise = null;
        });

    return cacheEntry.refreshPromise;
};

router.get('/all', async (req, res) => {
    const { compact } = req.query;
    const cacheKey = compact === 'true' ? 'compact' : 'full';
    const cacheEntry = BEATMAP_CACHE[cacheKey];

    try {
        if (isCacheFresh(cacheEntry)) {
            return res.status(200).json(cacheEntry.data);
        }

        if (cacheEntry.data !== null) {
            refreshBeatmapCache(cacheKey).catch((error) => {
                console.error(`Error refreshing beatmap ${cacheKey} cache:`, error);
            });
            return res.status(200).json(cacheEntry.data);
        }

        const beatmaps = await refreshBeatmapCache(cacheKey);
        return res.status(200).json(beatmaps);
    } catch (error) {
        console.error('Error fetching all beatmaps:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/tags', cache('24 hours'), async (req, res) => {
    try {
        const tags = await GetTags();
        return res.status(200).json(tags);
    } catch (error) {
        console.error('Error fetching tags:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:beatmapId/file', cache('1 hour'), async (req, res) => {
    const { beatmapId } = req.params;
    if (!beatmapId) {
        return res.status(400).json({ error: 'Beatmap ID parameter is required' });
    }

    //validate that beatmapId is a number
    if (isNaN(beatmapId)) {
        return res.status(400).json({ error: 'Beatmap ID must be a number' });
    }

    try {
        const beatmap = await FetchBeatmapFile(beatmapId);

        //return actual .osu file
        res.setHeader('Content-Disposition', `attachment; filename=${beatmapId}.osu`);
        res.setHeader('Content-Type', 'application/octet-stream');
        return res.status(200).send(beatmap);
    } catch (error) {
        console.error('Error fetching beatmap file:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/set/:beatmapsetId', cache('1 hour'), async (req, res) => {
    const { beatmapsetId } = req.params;
    req.apicacheGroup = `beatmapset-${beatmapsetId}`;
    if (!beatmapsetId) {
        return res.status(400).json({ error: 'Beatmapset ID parameter is required' });
    }

    try {
        const set = await GetBeatmapset(beatmapsetId);

        if (set) {
            let userIds = [];
            [...set.beatmaps, ...set.converts].forEach((b) => {
                let subOwnerIds = b.owners ? b.owners.map((o) => o.id) : [];
                userIds.push(...subOwnerIds);

                userIds.push(b.user_id); //also add mapper_id as owner
            });
            userIds.push(set.user_id);

            //parse the description
            //find user ids from the following
            //tags with class 'js-userlink' & data-user-id attribute
            //urls: https://osu.ppy.sh/users/123456 or https://osu.ppy.sh/u/123456
            let descriptionUserIds = [];
            const userIdRegex = /data-user-id="(\d+)"/g;
            let match;
            while ((match = userIdRegex.exec(set.description?.description)) !== null) {
                descriptionUserIds.push(match[1]);
            }
            const urlRegex = /https?:\/\/osu\.ppy\.sh\/(?:users|u)\/(\d+)/g;
            while ((match = urlRegex.exec(set.description?.description)) !== null) {
                descriptionUserIds.push(match[1]);
            }
            //add them to userIds as well
            userIds.push(...descriptionUserIds);

            descriptionUserIds = [...new Set(descriptionUserIds)]; //deduplicate description user ids
            userIds = [...new Set(userIds)]; //deduplicate
            // let users = await getFullUsers(userIds);
            let users = [];
            try {
                users = await getFullUsers(userIds);
            }catch (error) {
                //Do nothing, assume banned from osu
            }

            //filter nulls
            users = users.filter((u) => u !== null);

            let _userMap = {};
            users.forEach((o) => {
                _userMap[o.osuApi.id] = o;
            });

            [...set.beatmaps, ...set.converts].forEach((b) => {
                //reapply owners (overriding with full user data)
                if (b.owners) {
                    b.owners.forEach((o) => {
                        const fullOwnerData = _userMap[o.id];
                        o.user = fullOwnerData || null;
                    })
                }

                b.mapper = _userMap[b.user_id] || null;
            });
            set.mapper = _userMap[set.user_id] || null;
            set.description_user_data = descriptionUserIds.map((id) => _userMap[id] || null).filter((u) => u !== null);
            
            const beatmapMedia = await InspectorBeatmapMedia.findOne({
                where: {
                    beatmapset_id: beatmapsetId
                }
            });

            set.media = beatmapMedia || null;
            
            return res.status(200).json(set);
        } else {
            return res.status(404).json({ error: 'Beatmapset not found' });
        }
    } catch (error) {
        console.error('Error fetching beatmapset:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/set/:beatmapsetId/media', async (req, res) => {
    const { beatmapsetId } = req.params;
    const { access_token, youtube_url, spotify_url } = req.body || {};

    if (!beatmapsetId || isNaN(beatmapsetId)) {
        return res.status(400).json({ error: 'Beatmapset ID must be a number' });
    }

    if (!access_token || typeof access_token !== 'string') {
        return res.status(401).json({ error: 'Access token is required' });
    }

    let oauthUser = null;
    try {
        oauthUser = await GetOwnData(access_token);
    } catch (error) {
        console.error('Failed to validate access token for media update:', error);
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

        const normalizedYoutubeId = youtube_url ? extractYoutubeId(youtube_url) : null;
        if (youtube_url && !normalizedYoutubeId) {
            return res.status(400).json({ error: 'Invalid YouTube URL or video ID' });
        }

        const normalizedSpotifyPath = spotify_url ? extractSpotifyPath(spotify_url) : null;
        if (spotify_url && !normalizedSpotifyPath) {
            return res.status(400).json({ error: 'Invalid Spotify URL, URI, or embed path' });
        }

        const values = {
            beatmapset_id: parseInt(beatmapsetId, 10),
            youtube_id: normalizedYoutubeId || null,
            spotify_id: normalizedSpotifyPath || null,
        };

        const [media] = await InspectorBeatmapMedia.upsert(values, { returning: true });

        if (typeof routeCache.clear === 'function') {
            routeCache.clear(`beatmapset-${beatmapsetId}`);
        }

        return res.status(200).json({
            beatmapset_id: values.beatmapset_id,
            youtube_id: media?.youtube_id ?? values.youtube_id,
            spotify_id: media?.spotify_id ?? values.spotify_id,
        });
    } catch (error) {
        console.error('Error updating beatmap media:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/media/recommendations', async (req, res) => {
    const { source_type, source_value, limit } = req.body || {};
    const sourceField = getMediaFieldDefinition(source_type);

    if (!sourceField) {
        return res.status(400).json({ error: 'Invalid media source type' });
    }

    const normalizedSourceValue = normalizeMediaValueByKey(source_type, source_value);
    if (!normalizedSourceValue) {
        return res.status(400).json({ error: `Invalid ${sourceField.label} value` });
    }

    const recommendationLimit = Math.min(Math.max(toInteger(limit, 5), 1), 20);

    try {
        const matchingRows = await InspectorBeatmapMedia.findAll({
            where: {
                [sourceField.column]: normalizedSourceValue,
            },
            attributes: ['beatmapset_id', ...MEDIA_FIELD_DEFINITIONS.map((field) => field.column)],
            raw: true,
            limit: 500,
        });

        const recommendationFields = buildRecommendationFieldsFromRows(matchingRows, recommendationLimit, sourceField.key);

        return res.status(200).json({
            source_field: {
                key: sourceField.key,
                label: sourceField.label,
                value: normalizedSourceValue,
            },
            matched_rows: matchingRows.length,
            recommendation_fields: recommendationFields,
        });
    } catch (error) {
        console.error('Error fetching beatmap media recommendations:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/media/recommendations/by-artist-title', async (req, res) => {
    const { beatmapset_id, artist, title, limit, similar_set_limit } = req.body || {};
    const recommendationLimit = Math.min(Math.max(toInteger(limit, 5), 1), 20);
    const similarSetLimit = Math.min(Math.max(toInteger(similar_set_limit, 100), 10), 400);
    const currentBeatmapsetId = toInteger(beatmapset_id, null);

    const normalizedArtist = normalizeComparableText(artist);
    const normalizedTitle = normalizeComparableText(title);
    if (!normalizedArtist || !normalizedTitle) {
        return res.status(400).json({ error: 'Artist and title are required' });
    }

    try {
        const beatmapRows = await AltBeatmapLive.findAll({
            attributes: ['beatmapset_id', 'artist', 'title'],
            raw: true,
        });

        const beatmapsetMap = new Map();
        beatmapRows.forEach((row) => {
            if (!row?.beatmapset_id) {
                return;
            }

            if (!beatmapsetMap.has(row.beatmapset_id)) {
                beatmapsetMap.set(row.beatmapset_id, {
                    beatmapset_id: row.beatmapset_id,
                    artist: row.artist || '',
                    title: row.title || '',
                });
            }
        });

        const similarBeatmapsets = [];
        beatmapsetMap.forEach((row) => {
            if (currentBeatmapsetId !== null && row.beatmapset_id === currentBeatmapsetId) {
                return;
            }

            const artistSimilarity = getTextSimilarity(artist, row.artist);
            const titleSimilarity = getTextSimilarity(title, row.title);
            const combinedScore = (artistSimilarity * 0.45) + (titleSimilarity * 0.55);

            const isLikelySameMeaning = (
                (artistSimilarity >= 0.95 && titleSimilarity >= 0.75)
                || (artistSimilarity >= 0.75 && titleSimilarity >= 0.92)
                || (artistSimilarity >= 0.7 && titleSimilarity >= 0.7 && combinedScore >= 0.78)
            );

            if (!isLikelySameMeaning) {
                return;
            }

            similarBeatmapsets.push({
                beatmapset_id: row.beatmapset_id,
                artist: row.artist,
                title: row.title,
                artist_similarity: artistSimilarity,
                title_similarity: titleSimilarity,
                similarity_score: combinedScore,
            });
        });

        similarBeatmapsets.sort((left, right) => {
            if (right.similarity_score !== left.similarity_score) {
                return right.similarity_score - left.similarity_score;
            }

            if (right.title_similarity !== left.title_similarity) {
                return right.title_similarity - left.title_similarity;
            }

            return (left.beatmapset_id || 0) - (right.beatmapset_id || 0);
        });

        const limitedSimilarBeatmapsets = similarBeatmapsets.slice(0, similarSetLimit);
        const similarBeatmapsetIds = limitedSimilarBeatmapsets.map((row) => row.beatmapset_id);

        if (similarBeatmapsetIds.length === 0) {
            return res.status(200).json({
                source: {
                    beatmapset_id: currentBeatmapsetId,
                    artist,
                    title,
                },
                matched_beatmapsets: 0,
                matched_media_rows: 0,
                recommendation_fields: buildRecommendationFieldsFromRows([], recommendationLimit),
                similar_beatmapsets: [],
            });
        }

        const mediaRows = await InspectorBeatmapMedia.findAll({
            where: {
                beatmapset_id: {
                    [Op.in]: similarBeatmapsetIds,
                },
            },
            attributes: ['beatmapset_id', ...MEDIA_FIELD_DEFINITIONS.map((field) => field.column)],
            raw: true,
        });

        const recommendationFields = buildRecommendationFieldsFromRows(mediaRows, recommendationLimit);

        return res.status(200).json({
            source: {
                beatmapset_id: currentBeatmapsetId,
                artist,
                title,
            },
            matched_beatmapsets: similarBeatmapsetIds.length,
            matched_media_rows: mediaRows.length,
            recommendation_fields: recommendationFields,
            similar_beatmapsets: limitedSimilarBeatmapsets.slice(0, 20),
        });
    } catch (error) {
        console.error('Error fetching beatmap media recommendations by artist/title:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

const ALT_LIMIT = 1000;
router.all('/:beatmapId/scores/{:ruleset}', cache('1 hour'), async (req, res) => {
    const { beatmapId, ruleset } = req.params;
    //option mods in body
    const { mods } = req.body || {};

    if (!beatmapId) {
        return res.status(400).json({ error: 'Beatmap ID parameter is required' });
    }

    try {
        //validate ruleset if provided, if invalid, then unused (osu api will use default for given beatmap)
        let _ruleset = null;
        if(ruleset) {
            const slugLower = ruleset.toLowerCase();
            if(slugLower === 'total' || !OSU_SLUGS.hasOwnProperty(slugLower)) {
                _ruleset = null;
            }
        }

        const scores = await GetBeatmapScores(beatmapId, _ruleset, mods);
        let osu_api_scores = scores?.scores || [];
        let osu_alt_scores = [];

        let foundRulesetId = osu_api_scores.length > 0 ? osu_api_scores[0].ruleset_id : null;
        console.log('Found ruleset ID from API scores:', foundRulesetId);
        if(foundRulesetId !== null && !isNaN(foundRulesetId)) {
            const existingIds = new Set(osu_api_scores.map(s => s.id));
            const altScores = await AltScoreLive.findAll({
                where: {
                    beatmap_id: beatmapId,
                    ruleset_id: foundRulesetId,
                    id: { [Op.notIn]: Array.from(existingIds) },
                },
                order: [['classic_total_score', 'DESC']],
                limit: ALT_LIMIT,
            });
            console.log(`Fetched ${altScores.length} alternative scores from database for beatmap ${beatmapId} and ruleset ${foundRulesetId}`);
            osu_alt_scores = JSON.parse(JSON.stringify(altScores)); //convert to plain objects
        }

        if(osu_api_scores.length > 0 || osu_alt_scores.length > 0) {
            //get all user ids
            const userIds = new Set();
            osu_api_scores.forEach(s => userIds.add(s.user_id));
            osu_alt_scores.forEach(s => userIds.add(s.user_id_fk));

            const users = await getFullUsers(Array.from(userIds), true);
            const userMap = {};
            users.forEach(user => {
                if (!user || !user.osuApi) return;
                userMap[user.osuApi?.id] = user;
            });

            osu_api_scores.forEach(s => s.user = userMap[s.user_id] || null);
            osu_alt_scores.forEach(s => s.user = userMap[s.user_id_fk] || null);
        }

        if (scores) {
            return res.status(200).json({
                api: osu_api_scores,
                alt: osu_alt_scores
            });
        } else {
            return res.status(404).json({ error: 'Scores not found' });
        }
    }catch (error) {
        console.error('Error fetching beatmap scores:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:beatmapId', cache('1 hour'), async (req, res) => {
    //Validate beatmapId
    const { beatmapId } = req.params;
    if (!beatmapId) {
        return res.status(400).json({ error: 'Beatmap ID parameter is required' });
    }

    //validate that beatmapId is a number
    if (isNaN(beatmapId)) {
        return res.status(400).json({ error: 'Beatmap ID must be a number' });
    }

    try {
        // const Beatmap = await AltBeatmapLive.findOne({ where: { beatmap_id: beatmapId } });
        // if (Beatmap) {
        //     const beatmapset = await AltBeatmapLive.findAll({
        //         where: {
        //             beatmapset_id: Beatmap.beatmapset_id,
        //         },
        //         attributes: BATCH_ATTRIBUTES,
        //         raw: true,
        //     });
        //     // Beatmap.beatmapSet = beatmapSet;
        //     const _map = {
        //         ...Beatmap.get({ plain: true }),
        //         beatmapset
        //     }
        //     return res.status(200).json(_map);
        // } else {
        //     return res.status(404).json({ error: 'Beatmap not found' });
        // }
        const beatmap = await GetBeatmap(beatmapId);
        if (beatmap) {
            return res.status(200).json(beatmap);
        } else {
            return res.status(404).json({ error: 'Beatmap not found' });
        }
    } catch (error) {
        console.error('Error fetching beatmap:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
