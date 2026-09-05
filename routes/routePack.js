const express = require('express');
const { AltBeatmapPack } = require('../helpers/db');
const router = express.Router();
const cache = require('apicache-plus').middleware;
const { FetchBeatmapFile } = require('../helpers/diffCalcHelper');

router.get('/all', cache('1 hour') ,async (req, res) => {
    try {
        const beatmaps = await AltBeatmapPack.findAll({ raw: true });
        return res.status(200).json(beatmaps);
    } catch (error) {
        console.error('Error fetching all packs:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:packId', cache('1 hour'), async (req, res) => {
    //Validate packId
    const { packId } = req.params;
    if (!packId) {
        return res.status(400).json({ error: 'Pack ID parameter is required' });
    }

    try {
        const pack = await AltBeatmapPack.findOne({ where: { tag: packId } });
        if (pack) {
            return res.status(200).json(pack);
        }
        else {
            return res.status(404).json({ error: 'Pack not found' });
        }
    } catch (error) {
        console.error('Error fetching pack:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
