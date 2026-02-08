const express = require('express');
const { AltBeatmapLive } = require('../helpers/db');
const router = express.Router();
const apicache = require('apicache-plus');
const { FetchBeatmapFile } = require('../helpers/diffCalcHelper');

const BEATMAP_BATCH_SIZE = 10000;
const BEATMAP_CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
let BEATMAP_LAST_UPDATED = null;
let BEATMAP_CACHE = [];
router.get('/all', async (req, res) => {
    try {
        if(BEATMAP_CACHE.length > 0 && BEATMAP_LAST_UPDATED && (Date.now() - BEATMAP_LAST_UPDATED < BEATMAP_CACHE_DURATION)) {
            console.log('Serving beatmaps from cache');
            return res.status(200).json(BEATMAP_CACHE);
        }
        const beatmaps = await AltBeatmapLive.findAll({ raw: true });
        BEATMAP_CACHE = beatmaps;
        BEATMAP_LAST_UPDATED = Date.now();
        return res.status(200).json(beatmaps);
    } catch (error) {
        console.error('Error fetching all beatmaps:', error);
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
        const Beatmap = await AltBeatmapLive.findOne({ where: { beatmap_id: beatmapId } });
        if (Beatmap) {
            return res.status(200).json(Beatmap);
        } else {
            return res.status(404).json({ error: 'Beatmap not found' });
        }   
    } catch (error) {
        console.error('Error fetching beatmap:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
