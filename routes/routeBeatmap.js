const express = require('express');
const { AltBeatmapLive } = require('../helpers/db');
const router = express.Router();
const apicache = require('apicache-plus');
const { FetchBeatmapFile } = require('../helpers/diffCalcHelper');
const { GetTags, GetBeatmap, GetBeatmapset } = require('../helpers/osuApiHelper');
const { Op } = require('@sequelize/core');
const { getFullUsers } = require('../helpers/userHelper');

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

router.get('/tags', apicache('24 hours'), async (req, res) => {
    try {
        const tags = await GetTags();
        return res.status(200).json(tags);
    } catch (error) {
        console.error('Error fetching tags:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:beatmapId/file', apicache('1 hour'), async (req, res) => {
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

router.get('/set/:beatmapsetId', apicache('1 hour'), async (req, res) => {
    const { beatmapsetId } = req.params;
    if (!beatmapsetId) {
        return res.status(400).json({ error: 'Beatmapset ID parameter is required' });
    }

    try {
        const set = await GetBeatmapset(beatmapsetId);
        let ownerIds = [];
        [...set.beatmaps, ...set.converts].forEach((b) => {
            let subOwnerIds = b.owners ? b.owners.map((o) => o.id) : [];
            ownerIds.push(...subOwnerIds);
        });
        ownerIds = [...new Set(ownerIds)]; //deduplicate
        const owners = await getFullUsers(ownerIds);
        console.log('Owners:', ownerIds);
        [...set.beatmaps, ...set.converts].forEach((b) => {
            //reapply owners (overriding with full user data)
            if (b.owners) {
                b.owners.forEach((o) => {
                    const fullOwnerData = owners.find((u) => u.osuApi.id === o.id);
                    o.user = fullOwnerData || null;
                })
            }
        });
        if (set) {
            return res.status(200).json(set);
        } else {
            return res.status(404).json({ error: 'Beatmapset not found' });
        }
    } catch (error) {
        console.error('Error fetching beatmapset:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:beatmapId', apicache('1 hour'), async (req, res) => {
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
